import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull, like, or } from 'drizzle-orm';
import { resolveClubScope, canManageClub, canAssignRole, isDistrictScope } from '@/lib/auth/tenant';
import { validatePassword, generateTemporaryPassword } from '@/lib/auth/password';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// GET /api/members - 会員一覧
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    // クエリの clubId は信頼しない（IDOR 対策）
    const scope = resolveClubScope(session.user, url.searchParams.get('clubId'));
    if (scope.forbidden) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    const clubId = scope.clubId;
    const search = url.searchParams.get('search') || '';
    const role = url.searchParams.get('role') || '';
    const isActive = url.searchParams.get('isActive');

    let conditions = and(
      clubId ? eq(users.clubId, clubId) : undefined,
      isNull(users.deletedAt),
      role ? eq(users.role, role) : undefined,
      isActive !== null ? eq(users.isActive, isActive === 'true') : undefined,
    );

    const results = await db.select({
      id: users.id, name: users.name, nameKana: users.nameKana,
      email: users.email, phone: users.phone, role: users.role,
      memberType: users.memberType, position: users.position,
      joinedAt: users.joinedAt, resignedAt: users.resignedAt,
      isActive: users.isActive, clubId: users.clubId,
      birthDate: users.birthDate, allergy: users.allergy,
      dietaryNote: users.dietaryNote, memo: users.memo,
      createdAt: users.createdAt,
    }).from(users).where(conditions);

    const filtered = search
      ? results.filter(u =>
          u.name.includes(search) ||
          (u.nameKana && u.nameKana.includes(search)) ||
          u.email.includes(search)
        )
      : results;

    return NextResponse.json({ members: filtered });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/members - 会員追加
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();
    const {
      name, nameKana, email, phone, role = 'member', memberType = 'RAC',
      position, joinedAt, birthDate, addressZip, address, occupation,
      allergy, dietaryNote, emergencyContactName, emergencyContactPhone, memo,
      password,
    } = body;

    // 会員の追加はクラブ運営ロールのみ
    if (!canManageClub(session.user.role)) {
      return NextResponse.json({ error: '会員を追加する権限がありません' }, { status: 403 });
    }
    // 自分より上位のロールや地区ロールは付与させない（権限昇格の防止）
    if (typeof role !== 'string' || !canAssignRole(session.user.role, role, null)) {
      return NextResponse.json({ error: 'このロールは付与できません' }, { status: 403 });
    }
    // 一般会員以外（クラブアカウント・会長など）の作成はクラブアカウント以上に限る
    const actorRole = session.user.role;
    if (role !== 'member' && !isDistrictScope(actorRole) && actorRole !== 'club_account' && actorRole !== 'club_admin') {
      return NextResponse.json({ error: 'このロールは付与できません' }, { status: 403 });
    }

    if (!name || !email) return NextResponse.json({ error: '名前とメールは必須です' }, { status: 400 });
    if (password !== undefined && password !== null && password !== '') {
      const pwError = validatePassword(password);
      if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });
    }

    // パスワード未指定時は、会員ごとに別々の仮パスワードを発行して画面に表示する
    // （以前は全員共通の固定パスワードだったため、メールアドレスを知っていれば誰でもログインできた）
    const temporaryPassword = password ? null : generateTemporaryPassword(10);
    const passwordHash = await bcrypt.hash(password || temporaryPassword!, 10);
    const id = randomUUID();
    // ボディの clubId は信頼しない（他クラブ名義での作成を防ぐ）
    const writeScope = resolveClubScope(session.user, body.clubId);
    if (writeScope.forbidden) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    const clubId = writeScope.clubId;
    if (!clubId) return NextResponse.json({ error: '所属クラブが特定できません' }, { status: 400 });

    await db.insert(users).values({
      id, clubId, name, nameKana, email, phone, role, memberType,
      position, joinedAt, birthDate, addressZip, address, occupation,
      allergy, dietaryNote, emergencyContactName, emergencyContactPhone,
      memo, passwordHash, isActive: true,
    });

    // 仮パスワードはこの応答でだけ返す（保存はハッシュのみ）。管理者が本人に伝える
    return NextResponse.json({ member: { id, name, email, role, memberType }, temporaryPassword });
  } catch (e: any) {
    // Postgres の一意制約違反は code 23505（旧 SQLite の文言も念のため残す）
    if (e?.code === '23505' || e?.cause?.code === '23505' || e.message?.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
