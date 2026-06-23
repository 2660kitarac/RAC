import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances, meetings } from '@/lib/db/schema';
import { eq, and, isNull, isNotNull, count, desc, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';
import { MEMBER_TYPE_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/types';

export const metadata = { title: 'MU登録者一覧' };

const PAGE_SIZE = 50;

export default async function AttendancesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const clubId = session.user.clubId;

  // clubId がある場合、先にそのクラブの meeting_ids を取得
  let meetingIds: string[] = [];
  if (clubId) {
    const clubMeetings = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(and(eq(meetings.clubId, clubId), isNull(meetings.deletedAt)));
    meetingIds = clubMeetings.map(m => m.id);
  }

  const buildWhere = () => {
    const base = [isNull(attendances.userId), isNull(attendances.deletedAt)];
    if (clubId && meetingIds.length > 0) {
      base.push(inArray(attendances.meetingId, meetingIds));
    }
    return and(...base);
  };

  const [countResult, listResult, paidCountResult, unpaidCountResult] = await Promise.all([
    db.select({ value: count() }).from(attendances).where(buildWhere()),

    db.select({
      id: attendances.id,
      externalName: attendances.externalName,
      externalEmail: attendances.externalEmail,
      clubName: attendances.clubName,
      memberType: attendances.memberType,
      feeAmount: attendances.feeAmount,
      paymentStatus: attendances.paymentStatus,
      registeredAt: attendances.registeredAt,
      meetingId: attendances.meetingId,
    })
      .from(attendances)
      .where(buildWhere())
      .orderBy(desc(attendances.registeredAt))
      .limit(PAGE_SIZE)
      .offset(offset),

    db.select({ value: count() })
      .from(attendances)
      .where(and(
        isNull(attendances.userId),
        isNull(attendances.deletedAt),
        eq(attendances.paymentStatus, 'paid'),
        clubId && meetingIds.length > 0 ? inArray(attendances.meetingId, meetingIds) : undefined,
      )),

    db.select({ value: count() })
      .from(attendances)
      .where(and(
        isNull(attendances.userId),
        isNull(attendances.deletedAt),
        eq(attendances.paymentStatus, 'unpaid'),
        clubId && meetingIds.length > 0 ? inArray(attendances.meetingId, meetingIds) : undefined,
      )),
  ]);

  // 例会タイトルをまとめて取得
  const meetingIdList = [...new Set(listResult.map(a => a.meetingId))];
  const meetingMap: Record<string, { title: string; date: string }> = {};
  if (meetingIdList.length > 0) {
    const meetingRows = await db.select({ id: meetings.id, title: meetings.title, date: meetings.date })
      .from(meetings)
      .where(inArray(meetings.id, meetingIdList));
    meetingRows.forEach(m => { meetingMap[m.id] = { title: m.title, date: m.date }; });
  }

  const list = listResult.map(a => ({
    ...a,
    meeting: meetingMap[a.meetingId] || null,
  }));

  const totalCount = countResult[0]?.value || 0;
  const paidCount = paidCountResult[0]?.value || 0;
  const unpaidCount = unpaidCountResult[0]?.value || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">MU登録者一覧</h1>
        <p className="text-sm text-gray-500 mt-1">全例会のMakeup登録者・外部参加者</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500">総登録数</p>
          <p className="text-2xl font-bold text-gray-800">{totalCount}件</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500">支払済</p>
          <p className="text-2xl font-bold text-green-700">{paidCount}件</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500">未払い</p>
          <p className="text-2xl font-bold text-red-700">{unpaidCount}件</p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="bg-white border rounded-xl p-16 text-center text-gray-400">
          MU登録者がいません
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          {/* デスクトップ */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">氏名</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">所属クラブ</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">種別</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">例会</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">開催日</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">参加費</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">支払</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">詳細</th>
                </tr>
              </thead>
              <tbody>
                {list.map(a => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-medium">{a.externalName ?? '—'}</div>
                      {a.externalEmail && <div className="text-xs text-gray-400">{a.externalEmail}</div>}
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs">{a.clubName ?? '—'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-xs text-gray-500">
                        {MEMBER_TYPE_LABELS[a.memberType as keyof typeof MEMBER_TYPE_LABELS] ?? a.memberType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs max-w-[12rem] truncate">
                      {a.meeting?.title ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {a.meeting?.date ? formatDate(a.meeting.date) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs">
                      {formatCurrency(a.feeAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLORS[a.paymentStatus as keyof typeof PAYMENT_STATUS_COLORS] ?? ''}`}>
                        {PAYMENT_STATUS_LABELS[a.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS] ?? a.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link href={`/meetings/${a.meetingId}/attendances`} className="text-xs text-blue-600 hover:underline">
                        出席管理
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* モバイル */}
          <div className="sm:hidden divide-y">
            {list.map(a => (
              <div key={a.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{a.externalName ?? '—'}</p>
                    <p className="text-xs text-gray-400">{a.clubName ?? ''}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLORS[a.paymentStatus as keyof typeof PAYMENT_STATUS_COLORS] ?? ''}`}>
                    {PAYMENT_STATUS_LABELS[a.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS] ?? a.paymentStatus}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {a.meeting?.title ?? ''} / {formatCurrency(a.feeAmount)}
                </div>
              </div>
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            className="border-t px-4"
          />
        </div>
      )}
    </div>
  );
}
