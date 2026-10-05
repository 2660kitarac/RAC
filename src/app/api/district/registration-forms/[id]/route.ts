/**
 * 申込フォーム1件（地区役員用）
 *  GET    … フォーム設定・全申込・地区内クラブ一覧・操作履歴
 *  PUT    … 設定を保存（{ config }）
 *  DELETE … フォームを削除（申込データは残す）
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { eventRegistrationLogs, eventRegistrations, registrationForms } from '@/lib/db/schema';
import {
  loadDistrictClubs, loadStaffForm, logAction, requireDistrictStaff, sanitizeConfig,
} from '@/lib/event-registration/server';

type Ctx = { params: Promise<{ id: string }> };
const now = sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`;

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const staff = await requireDistrictStaff();
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
    const { id } = await params;
    const found = await loadStaffForm(staff.db, id, { role: staff.user.role, districtId: staff.districtId });
    if (!found) return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });

    const [registrations, logs, district] = await Promise.all([
      staff.db
        .select()
        .from(eventRegistrations)
        .where(and(eq(eventRegistrations.formId, found.form.id), isNull(eventRegistrations.deletedAt)))
        .orderBy(eventRegistrations.submittedAt),
      staff.db
        .select()
        .from(eventRegistrationLogs)
        .where(eq(eventRegistrationLogs.formId, found.form.id))
        .orderBy(desc(eventRegistrationLogs.createdAt))
        .limit(200),
      loadDistrictClubs(staff.db, found.form.districtId),
    ]);

    return NextResponse.json({
      form: { id: found.form.id, slug: found.form.slug, config: found.config, updatedAt: found.form.updatedAt },
      registrations,
      logs,
      districtName: district.districtName,
      clubs: district.clubs,
    });
  } catch (e) {
    console.error('GET /api/district/registration-forms/[id] error:', e);
    return NextResponse.json({ error: '読み込みに失敗しました' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const staff = await requireDistrictStaff();
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
    const { id } = await params;
    const found = await loadStaffForm(staff.db, id, { role: staff.user.role, districtId: staff.districtId });
    if (!found) return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { config?: unknown } | null;
    const config = sanitizeConfig(body?.config);
    await staff.db
      .update(registrationForms)
      .set({ config, updatedBy: staff.user.id, updatedAt: now })
      .where(eq(registrationForms.id, found.form.id));
    const changed = found.config.status !== config.status ? `受付状態：${found.config.status}→${config.status}` : '設定を更新';
    await logAction(staff.db, { formId: found.form.id, action: 'form_updated', actor: staff.user.name, detail: changed });
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    console.error('PUT /api/district/registration-forms/[id] error:', e);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const staff = await requireDistrictStaff();
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
    const { id } = await params;
    const found = await loadStaffForm(staff.db, id, { role: staff.user.role, districtId: staff.districtId });
    if (!found) return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    await staff.db.update(registrationForms).set({ deletedAt: now, updatedBy: staff.user.id }).where(eq(registrationForms.id, found.form.id));
    await logAction(staff.db, { formId: found.form.id, action: 'form_deleted', actor: staff.user.name, detail: found.config.title });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/district/registration-forms/[id] error:', e);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
