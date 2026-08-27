import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { donations } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canMutateClubRecord, canManageFinance, isDistrictScope } from '@/lib/auth/tenant';

type RouteContext = { params: Promise<{ id: string }> };

/** clubId による多重防御条件（地区スタッフはクラブ横断可） */
function clubGuard(user: { role?: string | null; clubId?: string | null }) {
  if (isDistrictScope(user?.role)) return undefined;
  return user?.clubId ? eq(donations.clubId, user.clubId) : undefined;
}

/** IDOR 対策: URL の id を信頼せず、レコードの clubId と突き合わせる */
async function assertOwned(
  db: any,
  id: string,
  user: { role?: string | null; clubId?: string | null },
) {
  const rows = await db
    .select({ id: donations.id, clubId: donations.clubId })
    .from(donations)
    .where(and(eq(donations.id, id), isNull(donations.deletedAt)))
    .limit(1);

  if (!rows.length) return NextResponse.json({ error: '寄付情報が見つかりません' }, { status: 404 });
  if (!canMutateClubRecord(user, rows[0].clubId)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }
  return null;
}

// PATCH /api/finance/donations/[id]
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!canManageFinance(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getDbFromContext();

    const denied = await assertOwned(db, id, session.user);
    if (denied) return denied;

    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = ['donorName', 'donorType', 'amount', 'message', 'paymentMethod', 'receivedAt'];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(donations)
      .set(updateData as any)
      .where(and(eq(donations.id, id), clubGuard(session.user)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/finance/donations/[id] error:', error);
    return NextResponse.json({ error: '寄付情報の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/finance/donations/[id]
export async function DELETE(_: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!canManageFinance(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getDbFromContext();

    const denied = await assertOwned(db, id, session.user);
    if (denied) return denied;

    await db.update(donations)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(donations.id, id), clubGuard(session.user)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/finance/donations/[id] error:', error);
    return NextResponse.json({ error: '寄付情報の削除に失敗しました' }, { status: 500 });
  }
}
