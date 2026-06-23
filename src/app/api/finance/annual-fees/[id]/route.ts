import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { annualFees } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// PATCH /api/finance/annual-fees/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = ['amount', 'paymentStatus', 'paymentMethod', 'paidAt', 'note', 'fiscalYear'];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(annualFees).set(updateData as any).where(eq(annualFees.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/finance/annual-fees/[id] error:', error);
    return NextResponse.json({ error: '年会費の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/finance/annual-fees/[id]
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    await db.update(annualFees)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(annualFees.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/finance/annual-fees/[id] error:', error);
    return NextResponse.json({ error: '年会費レコードの削除に失敗しました' }, { status: 500 });
  }
}
