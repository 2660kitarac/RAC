import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { canMutateClubRecord, isDistrictScope } from '@/lib/auth/tenant';
import { canResetPasswordFor, validatePassword } from '@/lib/auth/password';

type SessionUser = { id?: string | null; role?: string | null; clubId?: string | null };

/** クラブ内の会員を管理できるロール */
const CLUB_MANAGER_ROLES = ['club_account', 'club_admin', 'president', 'secretary'];

// PATCH /api/users/[id] - ロール・プロフィール更新
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();
    const body = await request.json();
    const sessionUser = session.user as SessionUser;

    const isAdmin = isDistrictScope(sessionUser.role) || sessionUser.role === 'admin';
    const isClubAdmin = CLUB_MANAGER_ROLES.includes(sessionUser.role || '');
    const isSelf = sessionUser.id === id;

    if (!isAdmin && !isClubAdmin && !isSelf) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    // ---- 対象ユーザーを取得してテナント検証 ----
    const [target] = await db
      .select({ id: users.id, clubId: users.clubId, role: users.role })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    // 本人以外を操作する場合は自クラブ限定（地区スタッフ・admin は全クラブ可）
    if (!isSelf && !isAdmin && !canMutateClubRecord(sessionUser, target.clubId)) {
      return NextResponse.json({ error: '他クラブのユーザーは操作できません' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    // 一般ユーザーが変更できるフィールド
    const selfAllowedFields = ['name', 'nameKana', 'phone', 'position', 'birthDate', 'addressZip', 'address', 'occupation', 'allergy', 'dietaryNote', 'emergencyContactName', 'emergencyContactPhone', 'memo'];
    // クラブ管理者が変更できるフィールド
    const clubAdminFields = ['role', 'position', 'status'];
    // 上位管理者のみ変更できるフィールド
    const adminOnlyFields = ['memberType', 'isActive', 'joinedAt', 'resignedAt', 'clubId', 'status'];

    // 本人フィールドは「本人」または「管理権限保持者」のみ
    if (isSelf || isAdmin || isClubAdmin) {
      for (const field of selfAllowedFields) {
        if (field in body) updateData[field] = body[field];
      }
    }

    if (isClubAdmin || isAdmin) {
      for (const field of clubAdminFields) {
        if (field in body) updateData[field] = body[field];
      }
    }

    if (isAdmin) {
      for (const field of adminOnlyFields) {
        if (field in body) updateData[field] = body[field];
      }
    }

    // ---- 権限昇格の防止 ----
    if ('role' in updateData && !isAdmin) {
      if (isDistrictScope(updateData.role as string)) {
        return NextResponse.json({ error: 'このロールは設定できません' }, { status: 403 });
      }
      if (isDistrictScope(target.role)) {
        return NextResponse.json({ error: 'このアカウントのロールは変更できません' }, { status: 403 });
      }
    }

    // ---- パスワード変更 ----
    // 本人による変更は現在のパスワード照合が必要なため /api/profile/password を使う。
    // ここでは管理者（自クラブ限定）による代理リセットのみ許可する。
    if (body.password) {
      if (isSelf) {
        return NextResponse.json(
          { error: '自分のパスワード変更は「パスワード変更」画面から行ってください' },
          { status: 400 }
        );
      }
      const permission = canResetPasswordFor(sessionUser, target);
      if (!permission.allowed) {
        return NextResponse.json({ error: permission.reason || '権限がありません' }, { status: 403 });
      }
      const validationError = validatePassword(body.password);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
      updateData.passwordHash = await bcrypt.hash(body.password, 10);
    }

    // テナント防御: WHERE 句にも自クラブ条件を入れる
    const scopeCondition = isAdmin || isSelf
      ? undefined
      : eq(users.clubId, sessionUser.clubId as string);

    await db.update(users).set(updateData as any)
      .where(and(eq(users.id, id), isNull(users.deletedAt), scopeCondition));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/users/[id] error:', error);
    return NextResponse.json({ error: 'ユーザー情報の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/users/[id] - 論理削除（管理者のみ）
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const sessionUser = session.user as SessionUser;
    const isAdmin = isDistrictScope(sessionUser.role) || sessionUser.role === 'admin';

    if (!isAdmin) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    // 自分自身の削除は許可しない（ロックアウト防止）
    if (sessionUser.id === id) {
      return NextResponse.json({ error: '自分自身は削除できません' }, { status: 400 });
    }

    const db = await getDbFromContext();
    await db.update(users)
      .set({ deletedAt: new Date().toISOString(), isActive: false })
      .where(and(eq(users.id, id), isNull(users.deletedAt)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/users/[id] error:', error);
    return NextResponse.json({ error: 'ユーザーの削除に失敗しました' }, { status: 500 });
  }
}
