import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, attendances, users } from '@/lib/db/schema';
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
    })
      .from(attendances)
      .where(and(eq(attendances.meetingId, id), isNull(attendances.deletedAt)))
      .orderBy(asc(attendances.registeredAt)),
  ]);

  const meeting = meetingResult[0];
  if (!meeting) notFound();

  return (
    <AttendanceManagement
      meeting={meeting as any}
      initialAttendances={attendancesResult as any}
      userRole={session.user.role || 'member'}
    />
  );
}
