import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { muVisits } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

// PATCH /api/mu-visits/[id] - 精算済みに更新 or 内容修正
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();
    const body = await request.json();

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updatedAt: now };

    const allowedFields = [
      'visitedClubName', 'visitDate', 'feeAmount', 'note',
      'settlementStatus', 'settledAt', 'settledBy', 'transactionId',
    ];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    // 精算済みにする場合は settledAt・settledBy を自動セット
    if (body.settlementStatus === 'settled') {
      updateData.settledAt = updateData.settledAt || now;
      updateData.settledBy = updateData.settledBy || session.user.id;
    }

    await db
      .update(muVisits)
      .set(updateData as any)
      .where(and(eq(muVisits.id, id), isNull(muVisits.deletedAt)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/mu-visits/[id] error:', error);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/mu-visits/[id] - 論理削除
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();

    await db
      .update(muVisits)
      .set({ deletedAt: new Date().toISOString() } as any)
      .where(and(eq(muVisits.id, id), isNull(muVisits.deletedAt)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/mu-visits/[id] error:', error);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
