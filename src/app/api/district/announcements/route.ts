/**
 * 地区からのお知らせ（地区役員用）
 *  GET  … 担当地区のお知らせ一覧（削除済みを除く）
 *  POST … お知らせを作成
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { districtAnnouncements } from '@/lib/db/schema';
import { nowJst, requireDistrictContext } from '@/lib/district/context';
import { sanitizeAnnouncementInput, sortAnnouncements, toAnnouncementView } from '@/lib/district/announcements';

export async function GET() {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.district) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });
    const rows = await ctx.db
      .select()
      .from(districtAnnouncements)
      .where(and(eq(districtAnnouncements.districtId, ctx.district.id), isNull(districtAnnouncements.deletedAt)))
      .orderBy(desc(districtAnnouncements.createdAt))
      .limit(500);
    return NextResponse.json({ announcements: sortAnnouncements(rows.map(toAnnouncementView)) });
  } catch (e) {
    console.error('GET /api/district/announcements error:', e);
    return NextResponse.json({ error: 'お知らせの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.district) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });
    const parsed = sanitizeAnnouncementInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const now = nowJst();
    const id = randomUUID();
    await ctx.db.insert(districtAnnouncements).values({
      id,
      districtId: ctx.district.id,
      ...parsed.value,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    });
    const [row] = await ctx.db.select().from(districtAnnouncements).where(eq(districtAnnouncements.id, id)).limit(1);
    return NextResponse.json({ announcement: row ? toAnnouncementView(row) : null }, { status: 201 });
  } catch (e) {
    console.error('POST /api/district/announcements error:', e);
    return NextResponse.json({ error: 'お知らせの作成に失敗しました' }, { status: 500 });
  }
}
