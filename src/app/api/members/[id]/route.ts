import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// PATCH /api/members/[id] - 会員更新
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = getDbFromContext();
    const body = await request.json();

    const updateData: any = { updatedAt: new Date().toISOString() };
    const allowed = ['name','nameKana','email','phone','role','memberType','position',
      'joinedAt','resignedAt','isActive','birthDate','addressZip','address',
      'occupation','allergy','dietaryNote','emergencyContactName','emergencyContactPhone','memo'];
    for (const key of allowed) {
      if (key in body) updateData[key] = body[key];
    }

    await db.update(users).set(updateData).where(eq(users.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/members/[id] - 会員論理削除
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = getDbFromContext();
    await db.update(users).set({
      deletedAt: new Date().toISOString(),
      isActive: false,
    }).where(eq(users.id, id));

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
