import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { annualFees } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canMutateClubRecord, canManageFinance, isDistrictScope } from '@/lib/auth/tenant';

type RouteContext = { params: Promise<{ id: string }> };

/** clubId による多重防御条件（地区スタッフはクラブ横断可） */
function clubGuard(user: { role?: string | null; clubId?: string | null }) {
  if (isDistrictScope(user?.role)) return undefined;
  return user?.clubId ? eq(annualFees.clubId, user.clubId) : undefined;
}

/** IDOR 対策: URL の id を信頼せず、レコードの clubId と突き合わせる */
async function assertOwned(
  db: any,
  id: string,
  user: { role?: string | null; clubId?: string | null },
) {
  const rows = await db
    .select({ id: annualFees.id, clubId: annualFees.clubId })
    .from(annualFees)
    .where(and(eq(annualFees.id, id), isNull(annualFees.deletedAt)))
    .limit(1);

  if (!rows.length) return NextResponse.json({ error: '年会費レコードが見つかりません' }, { status: 404 });
  if (!canMutateClubRecord(user, rows[0].clubId)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }
  return null;
}

// PATCH /api/finance/annual-fees/[id]
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
    const allowedFields = ['amount', 'paymentStatus', 'paymentMethod', 'paidAt', 'note', 'fiscalYear'];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(annualFees)
      .set(updateData as any)
      .where(and(eq(annualFees.id, id), clubGuard(session.user)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/finance/annual-fees/[id] error:', error);
    return NextResponse.json({ error: '年会費の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/finance/annual-fees/[id]
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

    await db.update(annualFees)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(annualFees.id, id), clubGuard(session.user)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/finance/annual-fees/[id] error:', error);
    return NextResponse.json({ error: '年会費レコードの削除に失敗しました' }, { status: 500 });
  }
}
