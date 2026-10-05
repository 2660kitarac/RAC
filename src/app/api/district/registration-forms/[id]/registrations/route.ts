/**
 * 地区役員による代理申込
 *  POST … メール・電話で受けた申込を地区役員が入力する（締切後でも可）
 */
import { NextRequest, NextResponse } from 'next/server';
import { eventRegistrations } from '@/lib/db/schema';
import { validateInput } from '@/lib/event-registration/calc';
import {
  isDuplicateClubError, loadDistrictClubs, loadStaffForm, logAction, newEditToken, newId, requireDistrictStaff,
  sanitizeInput, summaryColumns,
} from '@/lib/event-registration/server';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const staff = await requireDistrictStaff();
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
    const { id } = await params;
    const found = await loadStaffForm(staff.db, id, { role: staff.user.role, districtId: staff.districtId });
    if (!found) return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    const { form, config } = found;

    const body = (await request.json().catch(() => null)) as { input?: unknown } | null;
    const input = sanitizeInput(body?.input, config);
    if (input.clubId) {
      const { clubs, districtName } = await loadDistrictClubs(staff.db, form.districtId);
      const club = clubs.find(c => c.id === input.clubId);
      if (!club) input.clubId = null;
      else {
        input.clubName = club.name;
        input.districtName = districtName;
      }
    }
    const errors = validateInput(config, input);
    if (errors.length > 0) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

    const rid = newId();
    const token = newEditToken();
    await staff.db.insert(eventRegistrations).values({
      id: rid,
      formId: form.id,
      editToken: token,
      districtName: input.districtName || null,
      clubId: input.clubId,
      clubName: input.clubName,
      registrantName: input.registrantName,
      registrantEmail: input.registrantEmail,
      registrantPhone: input.registrantPhone || null,
      data: input,
      ...summaryColumns(config, input),
    });
    await logAction(staff.db, { formId: form.id, registrationId: rid, action: 'admin_created', actor: staff.user.name, detail: `${input.clubName} を代理入力（${input.attendees.length}名）` });
    return NextResponse.json({ id: rid, editPath: `/entry/${form.slug}/edit/${token}` });
  } catch (e) {
    if (isDuplicateClubError(e)) {
      return NextResponse.json({ error: 'このクラブはすでに申込があります。一覧の「詳細」から既存の申込を編集してください' }, { status: 409 });
    }
    console.error('POST /api/district/registration-forms/[id]/registrations error:', e);
    return NextResponse.json({ error: '代理入力に失敗しました' }, { status: 500 });
  }
}
