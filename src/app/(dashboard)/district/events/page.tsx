import { and, desc, eq, inArray, isNull, isNotNull, ne } from 'drizzle-orm';
import { clubs, districtEvents, eventRegistrations, registrationForms } from '@/lib/db/schema';
import { requireDistrictPage } from '@/lib/district/context';
import { sanitizeConfig } from '@/lib/event-registration/server';
import { isAccepting } from '@/lib/event-registration/calc';
import type { UserRole } from '@/types';
import DistrictEventsList, { type LinkedForm } from '@/components/district/DistrictEventsList';

export const metadata = { title: '地区行事' };

export default async function DistrictEventsPage() {
  const { db, user, district } = await requireDistrictPage();

  if (!district) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">地区行事</h1>
        <p className="mt-4 rounded-lg border bg-white p-8 text-center text-gray-500">
          地区が設定されていません。システム管理者にお問い合わせください。
        </p>
      </div>
    );
  }

  const [eventRows, clubRows] = await Promise.all([
    db.select().from(districtEvents)
      .where(and(eq(districtEvents.districtId, district.id), isNull(districtEvents.deletedAt)))
      .orderBy(desc(districtEvents.date))
      .catch(() => []),
    db.select({ id: clubs.id, name: clubs.name }).from(clubs)
      .where(and(eq(clubs.districtId, district.id), isNull(clubs.deletedAt), eq(clubs.isSystemClub, false)))
      .orderBy(clubs.name)
      .catch(() => []),
  ]);

  // 行事に紐づく申込フォームと申込件数
  const linkedForms: Record<string, LinkedForm[]> = {};
  try {
    const forms = await db
      .select({ id: registrationForms.id, eventId: registrationForms.districtEventId, config: registrationForms.config })
      .from(registrationForms)
      .where(and(
        eq(registrationForms.districtId, district.id),
        isNull(registrationForms.deletedAt),
        isNotNull(registrationForms.districtEventId),
      ));
    const counts = new Map<string, number>();
    if (forms.length > 0) {
      const regs = await db
        .select({ formId: eventRegistrations.formId })
        .from(eventRegistrations)
        .where(and(
          inArray(eventRegistrations.formId, forms.map(f => f.id)),
          isNull(eventRegistrations.deletedAt),
          ne(eventRegistrations.status, 'cancelled'),
        ));
      regs.forEach(r => counts.set(r.formId, (counts.get(r.formId) ?? 0) + 1));
    }
    const now = new Date();
    for (const f of forms) {
      if (!f.eventId) continue;
      const config = sanitizeConfig(f.config);
      const status: LinkedForm['status'] = config.status === 'draft'
        ? 'draft'
        : isAccepting(config, now) ? 'open' : 'closed';
      (linkedForms[f.eventId] ??= []).push({
        id: f.id,
        title: config.title,
        status,
        deadline: config.deadline,
        registrations: counts.get(f.id) ?? 0,
      });
    }
  } catch (e) {
    console.error('district events: linked forms error:', e);
  }

  // 画面用（スネークケース）に変換
  const events = eventRows.map(e => ({
    id: e.id,
    district_id: e.districtId,
    host_club_id: e.hostClubId,
    title: e.title,
    event_type: e.eventType,
    date: e.date,
    start_time: e.startTime,
    end_time: e.endTime,
    venue_name: e.venueName,
    venue_address: e.venueAddress,
    registration_fee: e.registrationFee ?? 0,
    registration_deadline: e.registrationDeadline,
    description: e.description,
    is_award_target: !!e.isAwardTarget,
    is_joint_meeting: !!e.isJointMeeting,
    created_at: e.createdAt,
  }));

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">地区行事</h1>
        <p className="text-sm text-gray-500 mt-1">
          {district.label}の行事を登録し、申込フォームと結びつけて管理します
        </p>
      </div>
      <DistrictEventsList
        events={events}
        clubs={clubRows}
        districtId={district.id}
        userRole={user.role as UserRole}
        linkedForms={linkedForms}
      />
    </div>
  );
}
