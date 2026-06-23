import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// PATCH /api/attendances/[id] - 出席情報更新
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = [
      'attendanceStatus', 'mealRequired', 'feeAmount', 'paymentStatus',
      'paymentMethod', 'paidAt', 'receiptRequired', 'receiptNameType',
      'receiptName', 'note', 'memberType',
    ];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(attendances).set(updateData as any).where(eq(attendances.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/attendances/[id] error:', error);
    return NextResponse.json({ error: '出席情報の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/attendances/[id] - 論理削除
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    await db.update(attendances)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(attendances.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/attendances/[id] error:', error);
    return NextResponse.json({ error: '出席情報の削除に失敗しました' }, { status: 500 });
  }
}
