import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canMutateClubRecord, canManageFinance, isDistrictScope } from '@/lib/auth/tenant';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 対象領収書を取得し、セッションユーザーが操作して良いか検証する。
 * IDOR 対策: URL の id は信頼せず、必ずレコードの clubId と突き合わせる。
 */
async function loadOwnedReceipt(
  db: any,
  id: string,
  user: { role?: string | null; clubId?: string | null },
) {
  const rows = await db
    .select({ id: receipts.id, clubId: receipts.clubId })
    .from(receipts)
    .where(and(eq(receipts.id, id), isNull(receipts.deletedAt)))
    .limit(1);

  if (!rows.length) return { error: 'notfound' as const };
  if (!canMutateClubRecord(user, rows[0].clubId)) return { error: 'forbidden' as const };
  return { record: rows[0] };
}

/** clubId による多重防御条件（地区スタッフはクラブ横断可） */
function clubGuard(user: { role?: string | null; clubId?: string | null }) {
  if (isDistrictScope(user?.role)) return undefined;
  return user?.clubId ? eq(receipts.clubId, user.clubId) : undefined;
}

// GET /api/receipts/[id]
export async function GET(_: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();

    const result = await db
      .select()
      .from(receipts)
      .where(and(eq(receipts.id, id), clubGuard(session.user)))
      .limit(1);

    if (!result.length) return NextResponse.json({ error: '領収書が見つかりません' }, { status: 404 });
    if (!canMutateClubRecord(session.user, (result[0] as any).clubId)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('GET /api/receipts/[id] error:', error);
    return NextResponse.json({ error: '領収書の取得に失敗しました' }, { status: 500 });
  }
}

// PATCH /api/receipts/[id] - ステータス更新（キャンセルなど）
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!canManageFinance(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getDbFromContext();

    const owned = await loadOwnedReceipt(db, id, session.user);
    if (owned.error === 'notfound') return NextResponse.json({ error: '領収書が見つかりません' }, { status: 404 });
    if (owned.error === 'forbidden') return NextResponse.json({ error: '権限がありません' }, { status: 403 });

    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = ['status', 'cancelReason', 'pdfUrl', 'receiptName', 'amount', 'description'];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(receipts)
      .set(updateData as any)
      .where(and(eq(receipts.id, id), clubGuard(session.user)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/receipts/[id] error:', error);
    return NextResponse.json({ error: '領収書の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/receipts/[id] - 論理削除
export async function DELETE(_: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!canManageFinance(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getDbFromContext();

    const owned = await loadOwnedReceipt(db, id, session.user);
    if (owned.error === 'notfound') return NextResponse.json({ error: '領収書が見つかりません' }, { status: 404 });
    if (owned.error === 'forbidden') return NextResponse.json({ error: '権限がありません' }, { status: 403 });

    await db.update(receipts)
      .set({ deletedAt: new Date().toISOString(), status: 'cancelled' })
      .where(and(eq(receipts.id, id), clubGuard(session.user)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/receipts/[id] error:', error);
    return NextResponse.json({ error: '領収書の削除に失敗しました' }, { status: 500 });
  }
}
