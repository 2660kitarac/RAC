import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings } from '@/lib/db/schema';
import { eq, and, isNull, gte, inArray, asc } from 'drizzle-orm';
import ReceptionPage from '@/components/attendances/ReceptionPage';

export const metadata = { title: '当日受付' };

export default async function MeetingReceptionPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();

  const clubId = session.user.clubId;
  const today = new Date().toISOString().split('T')[0];

  const meetingsResult = await db
    .select({
      id: meetings.id, title: meetings.title, date: meetings.date,
      status: meetings.status, feeRac: meetings.feeRac, feeRc: meetings.feeRc,
      feeObog: meetings.feeObog, feeGuest: meetings.feeGuest,
    })
    .from(meetings)
    .where(and(
      clubId ? eq(meetings.clubId, clubId) : isNull(meetings.deletedAt),
      inArray(meetings.status, ['open', 'closed']),
      gte(meetings.date, today),
      isNull(meetings.deletedAt),
    ))
    .orderBy(asc(meetings.date))
    .limit(5);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">当日受付</h1>
        <p className="text-sm text-gray-500 mt-1">例会当日の受付・支払い確認</p>
      </div>
      <ReceptionPage
        meetings={meetingsResult as any}
        clubId={clubId || ''}
        userRole={session.user.role || 'system_owner'}
      />
    </div>
  );
}
