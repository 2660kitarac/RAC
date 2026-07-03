import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, meetings } from '@/lib/db/schema';
import { eq, and, isNull, gte, lte, count, desc } from 'drizzle-orm';
import MeetingsList from '@/components/meetings/MeetingsList';

export const metadata = { title: '例会管理' };

const PAGE_SIZE = 20;

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; year?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const statusFilter = params.status || 'all';
  const year = params.year || String(new Date().getFullYear());
  const offset = (page - 1) * PAGE_SIZE;

  const clubId = session.user.clubId;

  if (!clubId) {
    return <MeetingsList
      meetings={[]}
      userRole={session.user.role || 'system_owner'}
      pagination={{ page: 1, totalPages: 0, totalCount: 0, pageSize: PAGE_SIZE }}
      filters={{ status: statusFilter, year }}
    />;
  }

  const baseWhere = [
    eq(meetings.clubId, clubId),
    isNull(meetings.deletedAt),
    gte(meetings.date, `${year}-01-01`),
    lte(meetings.date, `${year}-12-31`),
  ];
  if (statusFilter !== 'all') {
    baseWhere.push(eq(meetings.status, statusFilter));
  }

  const [countResult, meetingsResult] = await Promise.all([
    db.select({ value: count() })
      .from(meetings)
      .where(and(...baseWhere)),

    db.select({
      id: meetings.id,
      title: meetings.title,
      date: meetings.date,
      location: meetings.location,
      status: meetings.status,
      clubId: meetings.clubId,
      theme: meetings.theme,
      meetingNumber: meetings.meetingNumber,
      startTime: meetings.startTime,
      endTime: meetings.endTime,
      venueName: meetings.venueName,
      muRegistrationSlug: meetings.muRegistrationSlug,
      muRegistrationUrl: meetings.muRegistrationUrl,
    })
      .from(meetings)
      .where(and(...baseWhere))
      .orderBy(desc(meetings.date))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  const totalCount = countResult[0]?.value || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <MeetingsList
      meetings={meetingsResult as any}
      userRole={session.user.role || 'system_owner'}
      pagination={{ page, totalPages, totalCount, pageSize: PAGE_SIZE }}
      filters={{ status: statusFilter, year }}
    />
  );
}
