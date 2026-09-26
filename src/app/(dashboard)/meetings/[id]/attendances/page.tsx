import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, attendances, users, clubs } from '@/lib/db/schema';
import { displayAffiliation } from '@/lib/meetings/own-club';
import { eq, and, isNull, asc } from 'drizzle-orm';
import AttendanceManagement from '@/components/attendances/AttendanceManagement';

export default async function AttendanceManagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const [meetingResult, attendancesResult] = await Promise.all([
    db.select().from(meetings).where(and(eq(meetings.id, id), isNull(meetings.deletedAt))).limit(1),
    db.select({
      id: attendances.id,
      meetingId: attendances.meetingId,
      userId: attendances.userId,
      externalName: attendances.externalName,
      externalEmail: attendances.externalEmail,
      externalPhone: attendances.externalPhone,
      clubName: attendances.clubName,
      clubId: attendances.clubId,
      memberType: attendances.memberType,
      attendanceStatus: attendances.attendanceStatus,
      registrationType: attendances.registrationType,
      mealRequired: attendances.mealRequired,
      feeAmount: attendances.feeAmount,
      paymentStatus: attendances.paymentStatus,
      paymentMethod: attendances.paymentMethod,
      paidAt: attendances.paidAt,
      receiptRequired: attendances.receiptRequired,
      receiptName: attendances.receiptName,
      note: attendances.note,
      registeredAt: attendances.registeredAt,
      isLateRegistration: (attendances as any).isLateRegistration,
      registeredAfterDeadlineDays: (attendances as any).registeredAfterDeadlineDays,
      // users JOIN で会員名を取得（#issue1: userId あり会員の氏名が空欄になる問題を修正）
      userName: users.name,
      userEmail: users.email,
      userClubId: users.clubId,
      userClubName: clubs.name,
      userClubShortName: clubs.shortName,
    })
      .from(attendances)
      .leftJoin(users, eq(attendances.userId, users.id))
      .leftJoin(clubs, eq(users.clubId, clubs.id))
      .where(and(eq(attendances.meetingId, id), isNull(attendances.deletedAt)))
      .orderBy(asc(attendances.registeredAt)),
  ]);

  const meeting = meetingResult[0];
  if (!meeting) notFound();

  // 「所属」欄の表記をそろえるため、例会のクラブ名を取得する
  const [meetingClub] = await db
    .select({ name: clubs.name, shortName: clubs.shortName })
    .from(clubs)
    .where(eq(clubs.id, meeting.clubId))
    .limit(1);
  const ownClub = { id: meeting.clubId, name: meetingClub?.name ?? null, shortName: meetingClub?.shortName ?? null };

  // externalName 優先、なければ users.name にフォールバック（display_name と同じ優先順位）
  const attendanceList = attendancesResult.map(a => ({
    ...a,
    // AttendanceManagement が参照する両キー形式で提供
    externalName: a.externalName ?? a.userName ?? null,
    external_name: a.externalName ?? a.userName ?? null,
    is_late_registration: (a as any).isLateRegistration ?? false,
    registered_after_deadline_days: (a as any).registeredAfterDeadlineDays ?? null,
    user: a.userName ? { name: a.userName, email: a.userEmail } : undefined,
    // 一覧の「所属」表示用（自クラブ会員は登録経路にかかわらず同じ表記）
    display_club_name: displayAffiliation(a, ownClub),
  }));

  return (
    <AttendanceManagement
      meeting={meeting as any}
      initialAttendances={attendanceList as any}
      userRole={session.user.role || 'member'}
    />
  );
}
