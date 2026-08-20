import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubs, receipts, meetings } from '@/lib/db/schema';
import { eq, and, isNull, count, desc, gte } from 'drizzle-orm';
import ReceiptsList from '@/components/receipts/ReceiptsList';
import { Pagination } from '@/components/ui/pagination';
import type { UserRole } from '@/types';

export const metadata = { title: '領収書管理' };

const PAGE_SIZE = 30;

/** 直近何日分を既定表示にするか */
const RECENT_DAYS = 60;

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; meeting_id?: string; scope?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const clubId = session.user.clubId;

  // 表示範囲
  //  - meeting_id 指定あり → その例会の領収書のみ（例会ごとの管理）
  //  - scope=all         → 全期間（明示的に指定された場合のみ）
  //  - 既定               → 直近 RECENT_DAYS 日以内に発行したもののみ
  const meetingIdFilter = params.meeting_id || '';
  const scope = meetingIdFilter ? 'meeting' : params.scope === 'all' ? 'all' : 'recent';

  const recentSince = new Date();
  recentSince.setDate(recentSince.getDate() - RECENT_DAYS);
  const recentSinceStr = recentSince.toISOString().split('T')[0];

  const receiptWhere = and(
    clubId ? eq(receipts.clubId, clubId) : undefined,
    isNull(receipts.deletedAt),
    meetingIdFilter ? eq(receipts.meetingId, meetingIdFilter) : undefined,
    scope === 'recent' ? gte(receipts.issuedDate, recentSinceStr) : undefined,
  );

  const [countResult, receiptsResult, meetingsResult] = await Promise.all([
    db.select({ value: count() }).from(receipts).where(receiptWhere),

    // camelCase で返す（Drizzle ORM のデフォルト）
    db.select({
      id: receipts.id,
      receiptNumber: receipts.receiptNumber,
      receiptName: receipts.receiptName,
      amount: receipts.amount,
      description: receipts.description,
      issuedDate: receipts.issuedDate,
      status: receipts.status,
      cancelReason: receipts.cancelReason,
      meetingId: receipts.meetingId,
      attendanceId: receipts.attendanceId,
      meetingTitle: meetings.title,
      meetingDate: meetings.date,
    })
      .from(receipts)
      .leftJoin(meetings, eq(receipts.meetingId, meetings.id))
      .where(receiptWhere)
      .orderBy(desc(receipts.issuedDate), desc(receipts.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),

    db.select({ id: meetings.id, title: meetings.title, date: meetings.date })
      .from(meetings)
      .where(clubId
        ? and(eq(meetings.clubId, clubId), isNull(meetings.deletedAt))
        : isNull(meetings.deletedAt))
      .orderBy(desc(meetings.date))
      .limit(100),
  ]);

  // クラブ名取得
  let clubName = '';
  if (clubId) {
    const clubResult = await db.select({ name: clubs.name })
      .from(clubs).where(eq(clubs.id, clubId)).limit(1);
    clubName = clubResult[0]?.name || '';
  }

  const totalCount = countResult[0]?.value || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <ReceiptsList
        receipts={receiptsResult as any}
        meetings={meetingsResult}
        clubId={clubId || ''}
        clubName={clubName}
        userRole={(session.user.role || 'system_owner') as UserRole}
        totalCount={totalCount}
        scope={scope as 'recent' | 'all' | 'meeting'}
        recentDays={RECENT_DAYS}
        activeMeetingId={meetingIdFilter}
      />
      <Pagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        className="px-4"
      />
    </div>
  );
}
