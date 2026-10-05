/**
 * 地区からのお知らせ 1件の更新・削除（地区役員用）
 *  PATCH  … 内容を更新（POST と同じ項目をすべて送る）
 *  DELETE … 削除（論理削除）
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { districtAnnouncements } from '@/lib/db/schema';
import { nowJst, requireDistrictContext } from '@/lib/district/context';
import { sanitizeAnnouncementInput, toAnnouncementView } from '@/lib/district/announcements';

type RouteContext = { params: Promise<{ id: string }> };

/** 担当地区のお知らせだけを対象にする条件 */
function target(id: string, districtId: string) {
  return and(
    eq(districtAnnouncements.id, id.slice(0, 64)),
    eq(districtAnnouncements.districtId, districtId),
    isNull(districtAnnouncements.deletedAt),
  );
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.district) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });
    const { id } = await params;
    const where = target(id, ctx.district.id);
    const [existing] = await ctx.db.select({ id: districtAnnouncements.id }).from(districtAnnouncements).where(where).limit(1);
    if (!existing) return NextResponse.json({ error: 'お知らせが見つかりません' }, { status: 404 });

    const parsed = sanitizeAnnouncementInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    await ctx.db
      .update(districtAnnouncements)
      .set({ ...parsed.value, updatedBy: ctx.user.id, updatedAt: nowJst() })
      .where(where);
    const [row] = await ctx.db.select().from(districtAnnouncements).where(eq(districtAnnouncements.id, existing.id)).limit(1);
    return NextResponse.json({ announcement: row ? toAnnouncementView(row) : null });
  } catch (e) {
    console.error('PATCH /api/district/announcements/[id] error:', e);
    return NextResponse.json({ error: 'お知らせの更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.district) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });
    const { id } = await params;
    const where = target(id, ctx.district.id);
    const [existing] = await ctx.db.select({ id: districtAnnouncements.id }).from(districtAnnouncements).where(where).limit(1);
    if (!existing) return NextResponse.json({ error: 'お知らせが見つかりません' }, { status: 404 });
    const now = nowJst();
    await ctx.db
      .update(districtAnnouncements)
      .set({ deletedAt: now, updatedAt: now, updatedBy: ctx.user.id })
      .where(where);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/district/announcements/[id] error:', e);
    return NextResponse.json({ error: 'お知らせの削除に失敗しました' }, { status: 500 });
  }
}
