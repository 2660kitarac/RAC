import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { emailTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/emails/templates/[id]
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const result = await db.select().from(emailTemplates).where(eq(emailTemplates.id, params.id)).limit(1);
    if (!result.length) return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 });

    return NextResponse.json(result[0]);
  } catch (error) {
    return NextResponse.json({ error: 'テンプレートの取得に失敗しました' }, { status: 500 });
  }
}

// PATCH /api/emails/templates/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = ['name', 'templateType', 'subjectTemplate', 'bodyTemplate', 'isDefault'];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(emailTemplates).set(updateData as any).where(eq(emailTemplates.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'テンプレートの更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/emails/templates/[id] - 論理削除
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    await db.update(emailTemplates)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(emailTemplates.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'テンプレートの削除に失敗しました' }, { status: 500 });
  }
}
