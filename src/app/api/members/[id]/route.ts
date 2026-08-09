import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canMutateClubRecord, isDistrictScope } from '@/lib/auth/tenant';

/** 会員情報を編集できるロール */
const MEMBER_MANAGER_ROLES = [
  'system_owner', 'district_admin', 'district_representative', 'district_secretary',
  'club_account', 'club_admin', 'president', 'secretary',
];

type SessionUser = { id?: string | null; role?: string | null; clubId?: string | null };

function canManageMembers(role: string | null | undefined): boolean {
  return !!role && MEMBER_MANAGER_ROLES.includes(role);
}

/**
 * 対象会員を取得し、操作権限を検証する。
 * 自クラブの会員のみ操作可能（地区スタッフは全クラブ可）。
 */
async function loadAndAuthorize(db: any, sessionUser: SessionUser, id: string) {
  const [target] = await db
    .select({ id: users.id, clubId: users.clubId, role: users.role })
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);

  if (!target) {
    return { error: NextResponse.json({ error: '会員が見つかりません' }, { status: 404 }) };
  }

  const isSelf = sessionUser.id === id;

  // 本人以外を操作する場合は会員管理権限が必要
  if (!isSelf && !canManageMembers(sessionUser.role)) {
    return { error: NextResponse.json({ error: '権限がありません' }, { status: 403 }) };
  }

  // 他クラブの会員は操作不可（本人は例外）
  if (!isSelf && !canMutateClubRecord(sessionUser, target.clubId)) {
    return { error: NextResponse.json({ error: '他クラブの会員は操作できません' }, { status: 403 }) };
  }

  return { target, isSelf };
}

// PATCH /api/members/[id] - 会員更新
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();
    const sessionUser = session.user as SessionUser;

    const result = await loadAndAuthorize(db, sessionUser, id);
    if ('error' in result) return result.error;
    const { target, isSelf } = result;

    const body = await request.json();
    const updateData: any = { updatedAt: new Date().toISOString() };

    // 本人・管理者ともに変更可能なプロフィール項目
    const selfAllowed = ['name','nameKana','phone','birthDate','addressZip','address',
      'occupation','allergy','dietaryNote','emergencyContactName','emergencyContactPhone'];
    // 管理者のみ変更可能な項目
    const managerAllowed = ['email','role','memberType','position',
      'joinedAt','resignedAt','isActive','memo'];

    for (const key of selfAllowed) {
      if (key in body) updateData[key] = body[key];
    }

    const isManager = canManageMembers(sessionUser.role);
    if (isManager) {
      for (const key of managerAllowed) {
        if (key in body) updateData[key] = body[key];
      }

      // 上位ロールへの昇格はクラブ側からは不可（権限昇格の防止）
      if ('role' in updateData && !isDistrictScope(sessionUser.role)) {
        if (isDistrictScope(updateData.role)) {
          return NextResponse.json(
            { error: 'このロールは設定できません' },
            { status: 403 }
          );
        }
        // 上位ロールの会員のロールを書き換えることも不可
        if (isDistrictScope(target.role)) {
          return NextResponse.json(
            { error: 'このアカウントのロールは変更できません' },
            { status: 403 }
          );
        }
      }
    }

    // clubId の変更（テナント移動）は地区スタッフのみ
    if ('clubId' in body && isDistrictScope(sessionUser.role)) {
      updateData.clubId = body.clubId;
    }

    // テナント防御: WHERE 句にも自クラブ条件を入れる
    const scopeCondition = isDistrictScope(sessionUser.role) || isSelf
      ? undefined
      : eq(users.clubId, sessionUser.clubId as string);

    await db.update(users).set(updateData)
      .where(and(eq(users.id, id), isNull(users.deletedAt), scopeCondition));

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('PATCH /api/members/[id] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/members/[id] - 会員論理削除
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();
    const sessionUser = session.user as SessionUser;

    // 自分自身の削除は許可しない（ロックアウト防止）
    if (sessionUser.id === id) {
      return NextResponse.json({ error: '自分自身は削除できません' }, { status: 400 });
    }

    if (!canManageMembers(sessionUser.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const result = await loadAndAuthorize(db, sessionUser, id);
    if ('error' in result) return result.error;
    const { target } = result;

    // 上位ロールの会員はクラブ側から削除できない
    if (isDistrictScope(target.role) && !isDistrictScope(sessionUser.role)) {
      return NextResponse.json({ error: 'このアカウントは削除できません' }, { status: 403 });
    }

    const scopeCondition = isDistrictScope(sessionUser.role)
      ? undefined
      : eq(users.clubId, sessionUser.clubId as string);

    await db.update(users).set({
      deletedAt: new Date().toISOString(),
      isActive: false,
    }).where(and(eq(users.id, id), isNull(users.deletedAt), scopeCondition));

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('DELETE /api/members/[id] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
