import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/receipts/[id]
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const result = await db.select().from(receipts).where(eq(receipts.id, params.id)).limit(1);
    if (!result.length) return NextResponse.json({ error: '領収書が見つかりません' }, { status: 404 });

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('GET /api/receipts/[id] error:', error);
    return NextResponse.json({ error: '領収書の取得に失敗しました' }, { status: 500 });
  }
}

// PATCH /api/receipts/[id] - ステータス更新（キャンセルなど）
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = ['status', 'cancelReason', 'pdfUrl', 'receiptName', 'amount', 'description'];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(receipts).set(updateData as any).where(eq(receipts.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/receipts/[id] error:', error);
    return NextResponse.json({ error: '領収書の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/receipts/[id] - 論理削除
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    await db.update(receipts)
      .set({ deletedAt: new Date().toISOString(), status: 'cancelled' })
      .where(eq(receipts.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/receipts/[id] error:', error);
    return NextResponse.json({ error: '領収書の削除に失敗しました' }, { status: 500 });
  }
}
