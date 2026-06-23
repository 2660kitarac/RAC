import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

// GET /api/users?clubId=xxx&role=admin
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    // 自クラブ以外を見るには管理者権限が必要
    const url = new URL(request.url);
    const clubId = url.searchParams.get('clubId') || session.user.clubId;
    const role = url.searchParams.get('role');
    const isActive = url.searchParams.get('isActive');

    const db = getDbFromContext();

    const conditions = and(
      clubId ? eq(users.clubId, clubId) : undefined,
      isNull(users.deletedAt),
      role ? eq(users.role, role) : undefined,
      isActive !== null ? eq(users.isActive, isActive === 'true') : undefined,
    );

    const results = await db.select({
      id: users.id,
      clubId: users.clubId,
      name: users.name,
      nameKana: users.nameKana,
      email: users.email,
      phone: users.phone,
      role: users.role,
      memberType: users.memberType,
      position: users.position,
      joinedAt: users.joinedAt,
      resignedAt: users.resignedAt,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      // passwordHash は返さない
    }).from(users).where(conditions).orderBy(users.name);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/users error:', error);
    return NextResponse.json({ error: 'ユーザー一覧の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/users - ユーザー作成（system_owner / district_admin / club_admin が使用）
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const allowedRoles = ['system_owner', 'district_admin', 'admin', 'club_admin', 'president'];
    if (!allowedRoles.includes(session.user.role || '')) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const db = getDbFromContext();
    const body = await request.json();
    const {
      email, password, name, nameKana, phone,
      clubId, role, memberType, position,
      birthDate, addressZip, address, occupation,
      joinedAt, isActive,
    } = body;

    if (!email || !name) {
      return NextResponse.json({ error: 'email と name は必須です' }, { status: 400 });
    }

    // club_admin / president は自クラブにのみ作成可
    const isTopAdmin = ['system_owner', 'district_admin', 'admin'].includes(session.user.role || '');
    const targetClubId = clubId || session.user.clubId;
    if (!isTopAdmin && targetClubId !== session.user.clubId) {
      return NextResponse.json({ error: '他クラブへの登録は権限がありません' }, { status: 403 });
    }

    // メール重複チェック
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'このメールアドレスはすでに登録されています' }, { status: 409 });
    }

    // パスワードハッシュ（未指定なら仮パスワード）
    const rawPassword = password || Math.random().toString(36).slice(-10);
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    const id = randomUUID();
    await db.insert(users).values({
      id,
      email,
      passwordHash,
      name,
      nameKana: nameKana || null,
      phone: phone || null,
      clubId: targetClubId || null,
      role: role || 'member',
      memberType: memberType || 'RAC',
      position: position || null,
      birthDate: birthDate || null,
      addressZip: addressZip || null,
      address: address || null,
      occupation: occupation || null,
      joinedAt: joinedAt || null,
      isActive: isActive !== undefined ? isActive : true,
    });

    return NextResponse.json({
      id,
      success: true,
      // パスワードが指定されていなかった場合のみ仮パスワードを返す（初期案内用）
      ...(password ? {} : { tempPassword: rawPassword }),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/users error:', error);
    return NextResponse.json({ error: 'ユーザーの作成に失敗しました' }, { status: 500 });
  }
}
