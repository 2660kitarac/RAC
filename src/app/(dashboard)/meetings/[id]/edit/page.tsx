import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, users } from '@/lib/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import MeetingForm from '@/components/meetings/MeetingForm';

export const metadata = { title: '例会編集' };

export default async function MeetingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const clubId = session.user.clubId;

  const [meetingResult, membersResult] = await Promise.all([
    db.select().from(meetings).where(and(eq(meetings.id, id), isNull(meetings.deletedAt))).limit(1),
    db.select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.isActive, true), isNull(users.deletedAt)))
      .orderBy(asc(users.name)),
  ]);

  const meetingRaw = meetingResult[0];
  if (!meetingRaw) notFound();

  // Drizzle は camelCase で返すが MeetingForm は snake_case を期待するため変換する。
  // （変換がないと料金・懇親会・定員などが編集時に初期値として入らない）
  const meeting = {
    ...meetingRaw,
    meeting_number:               meetingRaw.meetingNumber,
    start_time:                   meetingRaw.startTime,
    end_time:                     meetingRaw.endTime,
    venue_name:                   meetingRaw.venueName,
    venue_address:                meetingRaw.venueAddress,
    manager_user_id:              meetingRaw.managerUserId,
    program_detail:               meetingRaw.programDetail,
    registration_deadline:        meetingRaw.registrationDeadline,
    deadline_policy:              (meetingRaw as any).deadlinePolicy ?? 'flexible',
    fee_rac:                      meetingRaw.feeRac,
    fee_rc:                       meetingRaw.feeRc,
    fee_obog:                     meetingRaw.feeObog,
    fee_guest:                    meetingRaw.feeGuest,
    meal_fee:                     meetingRaw.mealFee,
    mu_registration_slug:         meetingRaw.muRegistrationSlug,
    mu_registration_url:          meetingRaw.muRegistrationUrl,
    is_district_event:            meetingRaw.isDistrictEvent,
    own_club_fee:                 meetingRaw.ownClubFee ?? null,
    has_after_party:              meetingRaw.hasAfterParty,
    after_party_venue:            meetingRaw.afterPartyVenue,
    after_party_start_time:       meetingRaw.afterPartyStartTime,
    after_party_fee_type:         meetingRaw.afterPartyFeeType,
    after_party_fee_rac:          meetingRaw.afterPartyFeeRac,
    after_party_fee_rc:           meetingRaw.afterPartyFeeRc,
    after_party_fee_obog:         meetingRaw.afterPartyFeeObog,
    after_party_fee_guest:        meetingRaw.afterPartyFeeGuest,
    after_party_allow_party_only: meetingRaw.afterPartyAllowPartyOnly,
    after_party_capacity:         meetingRaw.afterPartyCapacity,
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">例会を編集</h1>
        <p className="text-sm text-gray-500 mt-1">{meetingRaw.title}</p>
      </div>
      <MeetingForm
        mode="edit"
        clubId={clubId || ''}
        meeting={meeting as any}
        members={membersResult}
      />
    </div>
  );
}
