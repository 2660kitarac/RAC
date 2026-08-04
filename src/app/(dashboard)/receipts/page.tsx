import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, receipts, meetings, attendances } from '@/lib/db/schema';
import { eq, and, isNull, count, desc } from 'drizzle-orm';
import ReceiptsList from '@/components/receipts/ReceiptsList';
import { Pagination } from '@/components/ui/pagination';

export const metadata = { title: '領収書管理' };

const PAGE_SIZE = 30;

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const clubId = session.user.clubId;

  const receiptWhere = clubId
    ? and(eq(receipts.clubId, clubId), isNull(receipts.deletedAt))
    : isNull(receipts.deletedAt);

  const [countResult, receiptsResult, meetingsResult, pendingResult] = await Promise.all([
    db.select({ value: count() }).from(receipts).where(receiptWhere),

    // ReceiptsList.tsx が snake_case キーで参照するためエイリアスで snake_case に揃える
    db.select({
      id: receipts.id,
      receipt_number: receipts.receiptNumber,
      receipt_name: receipts.receiptName,
      amount: receipts.amount,
      description: receipts.description,
      issued_date: receipts.issuedDate,
      status: receipts.status,
      cancel_reason: receipts.cancelReason,
      meeting_id: receipts.meetingId,
      attendance_id: receipts.attendanceId,
    })
      .from(receipts)
      .where(receiptWhere)
      .orderBy(desc(receipts.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),

    db.select({ id: meetings.id, title: meetings.title })
      .from(meetings)
      .where(clubId
        ? and(eq(meetings.clubId, clubId), isNull(meetings.deletedAt))
        : isNull(meetings.deletedAt))
      .orderBy(desc(meetings.date))
      .limit(100),

    // 領収書発行待ち: ReceiptsList.tsx が snake_case キーで参照するためエイリアスで揃える
    // clubId フィルタを追加して自クラブ分のみ取得
    db.select({
      id: attendances.id,
      external_name: attendances.externalName,
      fee_amount: attendances.feeAmount,
      meeting_id: attendances.meetingId,
      receipt_name: attendances.receiptName,
    })
      .from(attendances)
      .where(and(
        isNull(attendances.deletedAt),
        clubId ? eq(attendances.clubId, clubId) : undefined,
      ))
      .limit(50),
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
        pendingAttendances={pendingResult as any}
        meetings={meetingsResult}
        clubId={clubId || ''}
        clubName={clubName}
        userRole={session.user.role || 'system_owner'}
        totalCount={totalCount}
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
