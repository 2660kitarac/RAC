import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, clubs, attendances, transactions, meetingReports } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import MeetingDetail from '@/components/meetings/MeetingDetail';

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const [meetingResult, attendancesResult, txResult, reportResult] = await Promise.all([
    db.select().from(meetings).where(and(eq(meetings.id, id), isNull(meetings.deletedAt))).limit(1),
    db.select().from(attendances).where(and(eq(attendances.meetingId, id), isNull(attendances.deletedAt))),
    db.select().from(transactions).where(and(eq(transactions.meetingId, id), isNull(transactions.deletedAt))),
    db.select().from(meetingReports).where(and(eq(meetingReports.meetingId, id), isNull(meetingReports.deletedAt))).limit(1),
  ]);

  const meeting = meetingResult[0];
  if (!meeting) notFound();

  const attendanceList = attendancesResult;
  const stats = {
    totalAttendances: attendanceList.length,
    presentCount: attendanceList.filter(a => a.attendanceStatus === 'present').length,
    unpaidCount: attendanceList.filter(a => a.paymentStatus === 'unpaid').length,
    paidAmount: attendanceList.filter(a => a.paymentStatus === 'paid').reduce((s, a) => s + a.feeAmount, 0),
    incomeTotal: txResult.filter(t => t.transactionType === 'income').reduce((s, t) => s + t.amount, 0),
    expenseTotal: txResult.filter(t => t.transactionType === 'expense').reduce((s, t) => s + t.amount, 0),
  };

  return (
    <MeetingDetail
      meeting={meeting as any}
      attendances={attendanceList as any}
      stats={stats}
      report={reportResult[0] as any ?? null}
      userRole={session.user.role || 'member'}
    />
  );
}
