import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { transactions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// PATCH /api/finance/transactions/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = [
      'transactionType', 'category', 'amount', 'payerName', 'payeeName',
      'paymentMethod', 'transactionDate', 'description', 'receiptId', 'meetingId',
    ];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(transactions).set(updateData as any).where(eq(transactions.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/finance/transactions/[id] error:', error);
    return NextResponse.json({ error: '取引の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/finance/transactions/[id]
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    await db.update(transactions)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(transactions.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/finance/transactions/[id] error:', error);
    return NextResponse.json({ error: '取引の削除に失敗しました' }, { status: 500 });
  }
}
