import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, clubs, attendances, users, transactions, meetingReports } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import MeetingDetail from '@/components/meetings/MeetingDetail';

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const [meetingResult, attendancesResult, txResult, reportResult] = await Promise.all([
    db.select().from(meetings).where(and(eq(meetings.id, id), isNull(meetings.deletedAt))).limit(1),
    db.select({
      id:               attendances.id,
      meetingId:        attendances.meetingId,
      userId:           attendances.userId,
      externalName:     attendances.externalName,
      externalEmail:    attendances.externalEmail,
      externalPhone:    attendances.externalPhone,
      clubName:         attendances.clubName,
      memberType:       attendances.memberType,
      attendanceStatus: attendances.attendanceStatus,
      participationType:attendances.participationType,
      mealRequired:     attendances.mealRequired,
      feeAmount:        attendances.feeAmount,
      paymentStatus:    attendances.paymentStatus,
      paymentMethod:    attendances.paymentMethod,
      paidAt:           attendances.paidAt,
      note:             attendances.note,
      registeredAt:     attendances.registeredAt,
      // users JOIN
      userName:         users.name,
      userEmail:        users.email,
    })
      .from(attendances)
      .leftJoin(users, eq(attendances.userId, users.id))
      .where(and(eq(attendances.meetingId, id), isNull(attendances.deletedAt))),
    db.select().from(transactions).where(and(eq(transactions.meetingId, id), isNull(transactions.deletedAt))),
    db.select().from(meetingReports).where(and(eq(meetingReports.meetingId, id), isNull(meetingReports.deletedAt))).limit(1),
  ]);

  const meetingRaw = meetingResult[0];
  if (!meetingRaw) notFound();

  // Drizzle ORM は camelCase でSELECT結果を返すが、
  // MeetingDetail / Meeting型 は snake_case を期待するためマッピング
  const meeting = {
    ...meetingRaw,
    fee_rac:               meetingRaw.feeRac,
    fee_rc:                meetingRaw.feeRc,
    fee_obog:              meetingRaw.feeObog,
    fee_guest:             meetingRaw.feeGuest,
    meal_fee:              meetingRaw.mealFee,
    mu_registration_url:   meetingRaw.muRegistrationUrl,
    mu_registration_slug:  meetingRaw.muRegistrationSlug,
    meeting_number:        meetingRaw.meetingNumber,
    start_time:            meetingRaw.startTime,
    end_time:              meetingRaw.endTime,
    venue_name:            meetingRaw.venueName,
    venue_address:         meetingRaw.venueAddress,
    registration_deadline: meetingRaw.registrationDeadline,
    is_district_event:     meetingRaw.isDistrictEvent,
    is_joint_meeting:      meetingRaw.isJointMeeting,
    program_detail:        meetingRaw.programDetail,
    created_by:            meetingRaw.createdBy,
    created_at:            meetingRaw.createdAt,
    updated_at:            meetingRaw.updatedAt,
    deleted_at:            meetingRaw.deletedAt,
    club_id:               meetingRaw.clubId,
    manager_user_id:       meetingRaw.managerUserId,
  };

  // Drizzle camelCase → snake_case マッピング（MeetingDetail が snake_case を期待）
  const attendanceList = attendancesResult.map(a => ({
    ...a,
    meeting_id:        a.meetingId,
    user_id:           a.userId,
    external_name:     a.externalName,
    external_email:    a.externalEmail,
    external_phone:    a.externalPhone,
    club_name:         a.clubName,
    member_type:       a.memberType,
    attendance_status: a.attendanceStatus,
    participation_type:a.participationType,
    meal_required:     a.mealRequired,
    fee_amount:        a.feeAmount,
    payment_status:    a.paymentStatus,
    payment_method:    a.paymentMethod,
    paid_at:           a.paidAt,
    registered_at:     a.registeredAt,
    // JOIN したユーザー名
    display_name:      a.userName ?? a.externalName ?? '（名前なし）',
    user_name:         a.userName,
    user_email:        a.userEmail,
  }));

  const stats = {
    totalAttendances: attendanceList.length,
    presentCount: attendanceList.filter(a => a.attendance_status === 'present').length,
    unpaidCount: attendanceList.filter(a => a.payment_status === 'unpaid').length,
    paidAmount: attendanceList.filter(a => a.payment_status === 'paid').reduce((s, a) => s + a.fee_amount, 0),
    incomeTotal: txResult.filter(t => t.transactionType === 'income').reduce((s, t) => s + t.amount, 0),
    expenseTotal: txResult.filter(t => t.transactionType === 'expense').reduce((s, t) => s + t.amount, 0),
  };

  return (
    <MeetingDetail
      meeting={meeting as any}
      attendances={attendanceList as any}
      stats={stats}
      report={(reportResult[0] as any) ?? null}
      userRole={session.user.role || 'member'}
    />
  );
}
