import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, meetingReports, attendances, transactions } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import MeetingReportEditor from '@/components/reports/MeetingReportEditor';

export const metadata = { title: '例会報告書' };

export default async function MeetingReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const [meetingResult, reportResult, attendancesResult, txResult] = await Promise.all([
    db.select().from(meetings).where(and(eq(meetings.id, id), isNull(meetings.deletedAt))).limit(1),
    db.select().from(meetingReports).where(and(eq(meetingReports.meetingId, id), isNull(meetingReports.deletedAt))).limit(1),
    db.select({ memberType: attendances.memberType, attendanceStatus: attendances.attendanceStatus })
      .from(attendances).where(and(eq(attendances.meetingId, id), isNull(attendances.deletedAt))),
    db.select({ transactionType: transactions.transactionType, amount: transactions.amount })
      .from(transactions).where(and(eq(transactions.meetingId, id), isNull(transactions.deletedAt))),
  ]);

  const meeting = meetingResult[0];
  if (!meeting) notFound();

  const attendanceStats = {
    total: attendancesResult.length,
    rac: attendancesResult.filter(a => a.memberType === 'RAC').length,
    rc: attendancesResult.filter(a => a.memberType === 'RC').length,
    obog: attendancesResult.filter(a => a.memberType === 'OB_OG').length,
    guest: attendancesResult.filter(a => a.memberType === 'GUEST').length,
    income: txResult.filter(t => t.transactionType === 'income').reduce((s, t) => s + t.amount, 0),
    expense: txResult.filter(t => t.transactionType === 'expense').reduce((s, t) => s + t.amount, 0),
  };

  return (
    <MeetingReportEditor
      meeting={meeting as any}
      existingReport={reportResult[0] as any ?? null}
      attendanceStats={attendanceStats}
      userId={session.user.id}
    />
  );
}
