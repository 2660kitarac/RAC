import { NextRequest, NextResponse } from 'next/server';
import { districtEvents } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { nowJst, requireDistrictContext } from '@/lib/district/context';
import { parseEventInput } from '@/lib/district/event-input';

type RouteContext = { params: Promise<{ id: string }> };

/** 担当地区の行事か確認して返す */
async function loadEvent(ctx: Extract<Awaited<ReturnType<typeof requireDistrictContext>>, { ok: true }>, id: string) {
  if (!ctx.district) return null;
  const [ev] = await ctx.db
    .select({ id: districtEvents.id })
    .from(districtEvents)
    .where(and(eq(districtEvents.id, id.slice(0, 64)), eq(districtEvents.districtId, ctx.district.id), isNull(districtEvents.deletedAt)))
    .limit(1);
  return ev ?? null;
}

// PATCH /api/district/[id] - 地区行事更新
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    const { id } = await params;
    const existing = await loadEvent(ctx, id);
    if (!existing || !ctx.district) return NextResponse.json({ error: '行事が見つかりません' }, { status: 404 });

    const body = await request.json().catch(() => null);
    const parsed = await parseEventInput(ctx.db, ctx.district.id, body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    await ctx.db
      .update(districtEvents)
      .set({ ...parsed.values, updatedAt: nowJst() })
      .where(eq(districtEvents.id, existing.id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/district/[id] error:', error);
    return NextResponse.json({ error: '地区行事の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/district/[id] - 地区行事削除（論理削除）
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    const { id } = await params;
    const existing = await loadEvent(ctx, id);
    if (!existing) return NextResponse.json({ error: '行事が見つかりません' }, { status: 404 });

    const now = nowJst();
    await ctx.db.update(districtEvents).set({ deletedAt: now, updatedAt: now }).where(eq(districtEvents.id, existing.id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/district/[id] error:', error);
    return NextResponse.json({ error: '地区行事の削除に失敗しました' }, { status: 500 });
  }
}
