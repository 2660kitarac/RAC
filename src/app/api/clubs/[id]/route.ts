import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { isDistrictScope } from '@/lib/auth/tenant';

// 注: 旧実装は存在しないロール 'admin' を含み、逆に district_representative /
// district_secretary が漏れていたため、正規の判定関数へ統一する。
const isClubEditor = (role: string | null | undefined, clubId: string | null | undefined, targetId: string) =>
  isDistrictScope(role) || (!!clubId && clubId === targetId && role === 'club_account');

// GET /api/clubs/[id]
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();

    const isOwnClub = session.user.clubId === id;
    const district = isDistrictScope(session.user.role);

    // 自クラブ・地区スタッフは全項目、それ以外は公開情報のみに絞る
    // （メールアドレス・電話・住所・担当者名・メモの横断的な収集を防ぐ）
    const result = await db.select().from(clubs).where(eq(clubs.id, id)).limit(1);
    if (!result.length) return NextResponse.json({ error: 'クラブが見つかりません' }, { status: 404 });

    if (isOwnClub || district) {
      return NextResponse.json(result[0]);
    }

    const c = result[0] as any;
    return NextResponse.json({
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      slug: c.slug,
      type: c.type,
      district: c.district,
      area: c.area,
      isActive: c.isActive,
    });
  } catch (error) {
    console.error('GET /api/clubs/[id] error:', error);
    return NextResponse.json({ error: 'クラブの取得に失敗しました' }, { status: 500 });
  }
}

// PATCH /api/clubs/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    if (!isClubEditor(session.user.role, session.user.clubId, id)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const db = await getDbFromContext();
    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = ['name', 'shortName', 'slug', 'type', 'district', 'area', 'email', 'phone', 'address', 'contactName', 'memo', 'isActive'];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(clubs).set(updateData as any).where(eq(clubs.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/clubs/[id] error:', error);
    return NextResponse.json({ error: 'クラブの更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/clubs/[id] - 論理削除（system_owner / district_admin のみ）
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    // クラブの削除は地区スタッフのみ
    if (!isDistrictScope(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getDbFromContext();

    await db.update(clubs).set({
      deletedAt: new Date().toISOString(),
      isActive: false,
      updatedAt: new Date().toISOString(),
    } as any).where(eq(clubs.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clubs/[id] error:', error);
    return NextResponse.json({ error: 'クラブの削除に失敗しました' }, { status: 500 });
  }
}
