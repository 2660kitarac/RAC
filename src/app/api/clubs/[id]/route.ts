import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const ADMIN_ROLES = ['system_owner', 'admin', 'district_admin'];

// GET /api/clubs/[id]
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = getDbFromContext();
    const result = await db.select().from(clubs).where(eq(clubs.id, id)).limit(1);
    if (!result.length) return NextResponse.json({ error: 'クラブが見つかりません' }, { status: 404 });

    return NextResponse.json(result[0]);
  } catch (error) {
    return NextResponse.json({ error: 'クラブの取得に失敗しました' }, { status: 500 });
  }
}

// PATCH /api/clubs/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!ADMIN_ROLES.includes(session.user.role || '')) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = getDbFromContext();
    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = ['name', 'shortName', 'slug', 'type', 'district', 'area', 'email', 'phone', 'address', 'contactName', 'memo', 'isActive'];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(clubs).set(updateData as any).where(eq(clubs.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'クラブの更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/clubs/[id] - 論理削除（system_owner / district_admin のみ）
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!ADMIN_ROLES.includes(session.user.role || '')) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = getDbFromContext();

    await db.update(clubs).set({
      deletedAt: new Date().toISOString(),
      isActive: false,
      updatedAt: new Date().toISOString(),
    } as any).where(eq(clubs.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'クラブの削除に失敗しました' }, { status: 500 });
  }
}
