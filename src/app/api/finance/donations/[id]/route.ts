import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { donations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// PATCH /api/finance/donations/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = ['donorName', 'donorType', 'amount', 'message', 'paymentMethod', 'receivedAt'];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(donations).set(updateData as any).where(eq(donations.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/finance/donations/[id] error:', error);
    return NextResponse.json({ error: '寄付情報の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/finance/donations/[id]
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    await db.update(donations)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(donations.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/finance/donations/[id] error:', error);
    return NextResponse.json({ error: '寄付情報の削除に失敗しました' }, { status: 500 });
  }
}
