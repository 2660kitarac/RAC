/**
 * 地区行事の申込フォーム（地区役員用）
 *  GET  … 担当地区のフォーム一覧（申込数・金額の集計つき）
 *  POST … フォームを作成（{ config, districtEventId? }）
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { districtEvents, eventRegistrations, registrationForms } from '@/lib/db/schema';
import {
  logAction, newId, newSlug, requireDistrictStaff, sanitizeConfig,
} from '@/lib/event-registration/server';

export async function GET() {
  try {
    const staff = await requireDistrictStaff();
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
    const { db, districtId } = staff;
    if (!districtId) return NextResponse.json({ forms: [] });

    const forms = await db
      .select()
      .from(registrationForms)
      .where(and(eq(registrationForms.districtId, districtId), isNull(registrationForms.deletedAt)))
      .orderBy(desc(registrationForms.createdAt));
    const regs = forms.length
      ? await db
          .select({
            formId: eventRegistrations.formId,
            status: eventRegistrations.status,
            attendeeCount: eventRegistrations.attendeeCount,
            totalAmount: eventRegistrations.totalAmount,
            paidAmount: eventRegistrations.paidAmount,
          })
          .from(eventRegistrations)
          .where(and(inArray(eventRegistrations.formId, forms.map((f: { id: string }) => f.id)), isNull(eventRegistrations.deletedAt)))
      : [];

    return NextResponse.json({
      forms: forms.map((f: { id: string; slug: string; config: unknown; updatedAt: string; createdAt: string }) => {
        const mine = regs.filter((r: { formId: string; status: string }) => r.formId === f.id && r.status !== 'cancelled');
        return {
          id: f.id,
          slug: f.slug,
          config: sanitizeConfig(f.config),
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
          summary: {
            registrations: mine.length,
            attendees: mine.reduce((s: number, r: { attendeeCount: number }) => s + r.attendeeCount, 0),
            totalAmount: mine.reduce((s: number, r: { totalAmount: number }) => s + r.totalAmount, 0),
            paidAmount: mine.reduce((s: number, r: { paidAmount: number }) => s + r.paidAmount, 0),
          },
        };
      }),
    });
  } catch (e) {
    console.error('GET /api/district/registration-forms error:', e);
    return NextResponse.json({ error: '一覧の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireDistrictStaff();
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
    const { db, districtId, user } = staff;
    if (!districtId) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });

    const body = (await request.json().catch(() => null)) as { config?: unknown; districtEventId?: string } | null;
    const config = sanitizeConfig(body?.config);
    // 地区行事と紐づける場合は、同じ地区の行事に限る
    let districtEventId: string | null = null;
    if (typeof body?.districtEventId === 'string' && body.districtEventId) {
      const [ev] = await db
        .select({ id: districtEvents.id })
        .from(districtEvents)
        .where(and(eq(districtEvents.id, body.districtEventId.slice(0, 64)), eq(districtEvents.districtId, districtId)))
        .limit(1);
      districtEventId = ev?.id ?? null;
    }
    const id = newId();
    // 申込URLの末尾は重複しないものを選ぶ
    let slug = newSlug();
    for (let i = 0; i < 5; i++) {
      const [hit] = await db.select({ id: registrationForms.id }).from(registrationForms).where(eq(registrationForms.slug, slug)).limit(1);
      if (!hit) break;
      slug = newSlug();
    }
    await db.insert(registrationForms).values({
      id,
      districtId,
      districtEventId,
      slug,
      config,
      createdBy: user.id,
      updatedBy: user.id,
    });
    await logAction(db, { formId: id, action: 'form_created', actor: user.name, detail: config.title });
    return NextResponse.json({ id, slug });
  } catch (e) {
    console.error('POST /api/district/registration-forms error:', e);
    return NextResponse.json({ error: 'フォームの作成に失敗しました' }, { status: 500 });
  }
}
