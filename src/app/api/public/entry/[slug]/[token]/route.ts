/**
 * 申込の確認・修正（修正用リンク／ログイン不要）
 *  GET /api/public/entry/[slug]/[token] … 申込内容
 *  PUT /api/public/entry/[slug]/[token] … 修正（{ input }）または取り消し（{ cancel: true }）
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { eventRegistrations } from '@/lib/db/schema';
import { calcFees, isAccepting, validateInput } from '@/lib/event-registration/calc';
import {
  loadDistrictClubs, loadPublicForm, logAction, publicConfig, registrationText, sanitizeInput, sendMail,
  reconcilePaymentStatus, summaryColumns, type Db,
} from '@/lib/event-registration/server';

type Ctx = { params: Promise<{ slug: string; token: string }> };
const now = sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`;

async function load(db: Db, slug: string, token: string) {
  const found = await loadPublicForm(db, slug);
  if (!found) return null;
  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(and(
      eq(eventRegistrations.formId, found.form.id),
      eq(eventRegistrations.editToken, token.slice(0, 80)),
      isNull(eventRegistrations.deletedAt),
    ))
    .limit(1);
  if (!reg) return null;
  return { ...found, reg };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { slug, token } = await params;
    const db = await getDbFromContext();
    const found = await load(db, slug, token);
    if (!found) return NextResponse.json({ error: '申込が見つかりません。リンクをご確認ください' }, { status: 404 });
    const { districtName, clubs } = await loadDistrictClubs(db, found.form.districtId);
    return NextResponse.json({
      form: publicConfig(found.config),
      accepting: isAccepting(found.config) && found.reg.status !== 'cancelled',
      districtName,
      clubs,
      registration: {
        id: found.reg.id,
        status: found.reg.status,
        input: found.reg.data,
        totalAmount: found.reg.totalAmount,
        paymentStatus: found.reg.paymentStatus,
        submittedAt: found.reg.submittedAt,
        updatedAt: found.reg.updatedAt,
      },
    });
  } catch (e) {
    console.error('GET /api/public/entry/[slug]/[token] error:', e);
    return NextResponse.json({ error: '読み込みに失敗しました' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { slug, token } = await params;
    const db = await getDbFromContext();
    const found = await load(db, slug, token);
    if (!found) return NextResponse.json({ error: '申込が見つかりません。リンクをご確認ください' }, { status: 404 });
    const { form, config, reg } = found;
    if (!isAccepting(config)) {
      return NextResponse.json({ error: '締切を過ぎたため修正できません。地区役員にご連絡ください' }, { status: 403 });
    }
    if (reg.status === 'cancelled') {
      return NextResponse.json({ error: 'この申込は取り消し済みです。新しく申し込んでください' }, { status: 409 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: '内容が空です' }, { status: 400 });

    if (body.cancel === true) {
      await db.update(eventRegistrations).set({ status: 'cancelled', updatedAt: now }).where(eq(eventRegistrations.id, reg.id));
      await logAction(db, { formId: form.id, registrationId: reg.id, action: 'cancelled', actor: reg.registrantName, detail: '申込者が取り消し' });
      if (config.notifyEmail) await sendMail(config.notifyEmail, `【申込取消】${config.title}／${reg.clubName}`, `${reg.clubName}（${reg.registrantName}）の申込が取り消されました。`);
      return NextResponse.json({ ok: true, cancelled: true });
    }

    const input = sanitizeInput(body.input, config);
    // クラブは申込時のものを引き継ぐ（修正用リンクから別クラブに付け替えさせない）
    input.clubId = reg.clubId;
    if (reg.clubId) {
      input.clubName = reg.clubName;
      input.districtName = reg.districtName ?? input.districtName;
    }
    const errors = validateInput(config, input);
    if (errors.length > 0) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

    const cols = summaryColumns(config, input);
    await db.update(eventRegistrations).set({
      districtName: input.districtName || null,
      clubName: input.clubName,
      registrantName: input.registrantName,
      registrantEmail: input.registrantEmail,
      registrantPhone: input.registrantPhone || null,
      data: input,
      ...cols,
      paymentStatus: reconcilePaymentStatus(reg, cols.totalAmount),
      updatedAt: now,
    }).where(eq(eventRegistrations.id, reg.id));
    await logAction(db, { formId: form.id, registrationId: reg.id, action: 'updated', actor: input.registrantName, detail: `${input.attendees.length}名に修正` });

    const text = registrationText(config, input);
    await sendMail(input.registrantEmail, `【申込内容を修正しました】${config.title}`, `${input.registrantName} 様\n\nお申込み内容の修正を受け付けました。\n\n${text}\n`);
    if (config.notifyEmail) await sendMail(config.notifyEmail, `【申込修正】${config.title}／${input.clubName}`, text);

    return NextResponse.json({ ok: true, fees: calcFees(config, input) });
  } catch (e) {
    console.error('PUT /api/public/entry/[slug]/[token] error:', e);
    return NextResponse.json({ error: '修正の保存に失敗しました' }, { status: 500 });
  }
}
