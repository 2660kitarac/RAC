/**
 * 申込1件の更新（地区役員用）
 *  PATCH … 次のいずれか（複数可）
 *    { payment: { status, paidAmount, paidAt, note } }  入金確認
 *    { adminNote }                                     地区役員メモ
 *    { input }                                         申込内容の修正（締切後でも可）
 *    { status: 'submitted' | 'cancelled' }             取り消し・取り消しの解除
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { eventRegistrations } from '@/lib/db/schema';
import { validateInput } from '@/lib/event-registration/calc';
import {
  isDuplicateClubError, loadStaffForm, logAction, reconcilePaymentStatus, requireDistrictStaff, sanitizeInput, summaryColumns,
} from '@/lib/event-registration/server';
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from '@/lib/event-registration/types';

type Ctx = { params: Promise<{ id: string; rid: string }> };
const now = sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`;

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const staff = await requireDistrictStaff();
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
    const { id, rid } = await params;
    const found = await loadStaffForm(staff.db, id, { role: staff.user.role, districtId: staff.districtId });
    if (!found) return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    const [reg] = await staff.db
      .select()
      .from(eventRegistrations)
      .where(and(eq(eventRegistrations.id, rid.slice(0, 64)), eq(eventRegistrations.formId, found.form.id), isNull(eventRegistrations.deletedAt)))
      .limit(1);
    if (!reg) return NextResponse.json({ error: '申込が見つかりません' }, { status: 404 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: '内容が空です' }, { status: 400 });

    const set: Record<string, unknown> = { updatedAt: now };
    const notes: string[] = [];

    if (body.payment && typeof body.payment === 'object') {
      const p = body.payment as Record<string, unknown>;
      const status = (['unpaid', 'partial', 'paid'].includes(p.status as string) ? p.status : reg.paymentStatus) as PaymentStatus;
      const paidAmount = Math.max(0, Math.min(10_000_000, Math.floor(Number(p.paidAmount ?? (status === 'paid' ? reg.totalAmount : 0)))) || 0);
      set.paymentStatus = status;
      set.paidAmount = paidAmount;
      set.paidAt = typeof p.paidAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.paidAt) ? p.paidAt.slice(0, 10) : status === 'unpaid' ? null : reg.paidAt;
      set.paymentNote = typeof p.note === 'string' ? p.note.slice(0, 500) : reg.paymentNote;
      notes.push(`入金：${PAYMENT_STATUS_LABELS[status]} ${paidAmount.toLocaleString()}円`);
    }

    if (typeof body.adminNote === 'string') {
      set.adminNote = body.adminNote.slice(0, 2000);
      notes.push('メモを更新');
    }

    if (body.status === 'submitted' || body.status === 'cancelled') {
      set.status = body.status;
      notes.push(body.status === 'cancelled' ? '取り消し' : '取り消しを解除');
    }

    if (body.input !== undefined) {
      const input = sanitizeInput(body.input, found.config);
      input.clubId = reg.clubId;
      if (reg.clubId) {
        input.clubName = reg.clubName;
        input.districtName = reg.districtName ?? input.districtName;
      }
      const errors = validateInput(found.config, input);
      if (errors.length > 0) return NextResponse.json({ error: errors[0], errors }, { status: 400 });
      Object.assign(set, {
        districtName: input.districtName || null,
        clubName: input.clubName,
        registrantName: input.registrantName,
        registrantEmail: input.registrantEmail,
        registrantPhone: input.registrantPhone || null,
        data: input,
        ...summaryColumns(found.config, input),
      });
      // 入金の記録を同時に送っていなければ、金額の変化に合わせて入金状況を直す
      if (!body.payment) {
        set.paymentStatus = reconcilePaymentStatus(reg, (set.totalAmount as number) ?? reg.totalAmount);
      }
      notes.push(`内容を修正（${input.attendees.length}名）`);
    }

    if (notes.length === 0) return NextResponse.json({ error: '変更する内容がありません' }, { status: 400 });

    await staff.db.update(eventRegistrations).set(set).where(eq(eventRegistrations.id, reg.id));
    await logAction(staff.db, {
      formId: found.form.id,
      registrationId: reg.id,
      action: body.payment ? 'payment' : body.input !== undefined ? 'admin_edit' : 'admin_update',
      actor: staff.user.name,
      detail: `${reg.clubName}：${notes.join('／')}`,
    });
    const [updated] = await staff.db.select().from(eventRegistrations).where(eq(eventRegistrations.id, reg.id)).limit(1);
    return NextResponse.json({ registration: updated });
  } catch (e) {
    if (isDuplicateClubError(e)) {
      return NextResponse.json({ error: 'このクラブには別の申込が有効なため、取り消しを解除できません' }, { status: 409 });
    }
    console.error('PATCH /api/district/registration-forms/[id]/registrations/[rid] error:', e);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}
