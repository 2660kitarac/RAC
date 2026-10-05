/**
 * 申込の集計を Excel で書き出す（地区役員用）
 *  GET /api/district/registration-forms/[id]/export
 *  シート：集計（クラブ別）／参加者一覧／物販・協賛／未申込クラブ
 */
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { and, eq, isNull } from 'drizzle-orm';
import { eventRegistrations } from '@/lib/db/schema';
import { attendeeName, calcFees } from '@/lib/event-registration/calc';
import { loadDistrictClubs, loadStaffForm, requireDistrictStaff } from '@/lib/event-registration/server';
import { PAYMENT_STATUS_LABELS, type PaymentStatus, type RegistrationInput } from '@/lib/event-registration/types';

type Ctx = { params: Promise<{ id: string }> };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
    c.border = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const staff = await requireDistrictStaff();
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
    const { id } = await params;
    const found = await loadStaffForm(staff.db, id, { role: staff.user.role, districtId: staff.districtId });
    if (!found) return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    const { form, config } = found;

    const regs = (await staff.db
      .select()
      .from(eventRegistrations)
      .where(and(eq(eventRegistrations.formId, form.id), isNull(eventRegistrations.deletedAt), eq(eventRegistrations.status, 'submitted')))
      .orderBy(eventRegistrations.submittedAt)) as Array<Record<string, unknown> & { data: RegistrationInput }>;
    const { clubs } = await loadDistrictClubs(staff.db, form.districtId);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'RAC Cloud';

    // ---- 集計（クラブ別） ----
    const sum = wb.addWorksheet('集計');
    sum.addRow([config.title]).font = { bold: true, size: 14 };
    sum.addRow([`開催日：${config.eventDate ?? ''}　会場：${config.venue}　締切：${config.deadline ?? ''}`]);
    sum.addRow([]);
    const sessionCols = config.sessions.map(s => s.name);
    styleHeader(sum.addRow(['No', '地区', 'クラブ', '登録責任者', 'メール', '電話', '人数', ...sessionCols, '登録料', '物販・協賛', '合計', '入金状況', '入金額', '入金日', '申込日時', '諸事連絡', 'メモ']));
    let totals = { people: 0, reg: 0, items: 0, total: 0, paid: 0 };
    const sessionTotals = config.sessions.map(() => 0);
    regs.forEach((r, i) => {
      const input = r.data;
      const counts = config.sessions.map((s, si) => {
        const n = input.attendees.filter(a => a.sessions?.[s.key]).length;
        sessionTotals[si] += n;
        return n;
      });
      totals = {
        people: totals.people + input.attendees.length,
        reg: totals.reg + Number(r.registrationFee),
        items: totals.items + Number(r.itemsFee),
        total: totals.total + Number(r.totalAmount),
        paid: totals.paid + Number(r.paidAmount),
      };
      sum.addRow([
        i + 1, r.districtName ?? '', r.clubName, r.registrantName, r.registrantEmail, r.registrantPhone ?? '',
        input.attendees.length, ...counts, r.registrationFee, r.itemsFee, r.totalAmount,
        PAYMENT_STATUS_LABELS[(r.paymentStatus as PaymentStatus) ?? 'unpaid'], r.paidAmount, r.paidAt ?? '',
        String(r.submittedAt ?? '').slice(0, 16), input.message ?? '', r.adminNote ?? '',
      ]);
    });
    const totalRow = sum.addRow(['', '', '合計', '', '', '', totals.people, ...sessionTotals, totals.reg, totals.items, totals.total, '', totals.paid]);
    totalRow.font = { bold: true };

    // 区分×枠の人数
    sum.addRow([]);
    styleHeader(sum.addRow(['区分', ...sessionCols, '人数']));
    for (const c of config.categories) {
      const people = regs.flatMap(r => r.data.attendees).filter(a => a.category === c.key);
      sum.addRow([c.name, ...config.sessions.map(s => people.filter(a => a.sessions?.[s.key]).length), people.length]);
    }
    sum.columns.forEach((col, i) => { col.width = i === 2 ? 26 : i === 4 ? 26 : 12; });
    for (const col of [7 + config.sessions.length + 1, 7 + config.sessions.length + 2, 7 + config.sessions.length + 3, 7 + config.sessions.length + 5]) {
      sum.getColumn(col).numFmt = '#,##0';
    }

    // ---- 参加者一覧 ----
    const att = wb.addWorksheet('参加者一覧');
    styleHeader(att.addRow(['No', '地区', '申込クラブ', '所属', '氏名', 'フリガナ', '役職', '区分', '20歳未満', ...config.sessions.map(s => s.name), '登録料', config.attendeeFields.noteLabel]));
    let no = 0;
    for (const r of regs) {
      const fees = calcFees(config, r.data);
      for (const a of r.data.attendees) {
        no += 1;
        att.addRow([
          no, r.districtName ?? '', r.clubName, a.clubName || r.clubName, attendeeName(a),
          [a.lastKana, a.firstKana].filter(Boolean).join(' '), a.position,
          config.categories.find(c => c.key === a.category)?.name ?? '', a.under20 ? '○' : '',
          ...config.sessions.map(s => (a.sessions?.[s.key] ? '参加' : '欠席')),
          fees.perAttendee[a.id] ?? 0, a.note,
        ]);
      }
    }
    att.columns.forEach((col, i) => { col.width = [5, 12, 24, 22, 16, 18, 16, 16, 8][i] ?? 12; });

    // ---- 物販・協賛 ----
    if (config.items.length > 0) {
      const it = wb.addWorksheet('物販・協賛');
      styleHeader(it.addRow(['クラブ', '項目', '種類', '数量', '購入者', '記載名', '金額']));
      for (const r of regs) {
        for (const item of config.items) {
          if (item.kind === 'quantity') {
            const q = r.data.items?.quantities?.[item.key] ?? 0;
            if (q > 0) it.addRow([r.clubName, item.name, '', q, '', '', q * item.price]);
          } else {
            for (const n of (r.data.items?.named ?? []).filter(x => x.itemKey === item.key)) {
              const opt = item.options.find(o => o.key === n.optionKey);
              it.addRow([r.clubName, item.name, opt?.label ?? '', 1, n.buyerName, n.label, opt?.price ?? 0]);
            }
          }
        }
      }
      it.columns.forEach((col, i) => { col.width = [26, 22, 12, 8, 18, 30, 12][i] ?? 12; });
      it.getColumn(7).numFmt = '#,##0';
    }

    // ---- 未申込クラブ ----
    const submittedIds = new Set(regs.map(r => r.clubId).filter(Boolean));
    const missing = clubs.filter(c => !submittedIds.has(c.id));
    const ms = wb.addWorksheet('未申込クラブ');
    styleHeader(ms.addRow(['クラブ']));
    missing.forEach(c => ms.addRow([c.name]));
    ms.getColumn(1).width = 34;

    const buf = await wb.xlsx.writeBuffer();
    const filename = encodeURIComponent(`${config.title}_申込集計.xlsx`);
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (e) {
    console.error('GET export error:', e);
    return NextResponse.json({ error: '書き出しに失敗しました' }, { status: 500 });
  }
}
