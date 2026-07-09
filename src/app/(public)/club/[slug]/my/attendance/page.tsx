import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, attendances, meetings, clubs, muVisits } from '@/lib/db/schema';
import { eq, and, isNull, desc, count, gte, asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';
import { ArrowLeft, History, CalendarCheck, MapPin } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import MyUpcomingAttendances from '@/components/public/MyUpcomingAttendances';
import MuVisitReportForm from '@/components/public/MuVisitReportForm';

const PAGE_SIZE = 20;

export default async function MyAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/club/${slug}/login`);

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const db = await getDbFromContext();
  const userEmail = session.user.email!;
  const userId = session.user.id;
  const clubId = session.user.clubId;
  const todayStr = new Date().toISOString().split('T')[0];

  // 今後の参加予定（今日以降の例会）
  const upcomingAttendances = await db
    .select({
      id: attendances.id,
      meetingId: attendances.meetingId,
      feeAmount: attendances.feeAmount,
      paymentStatus: attendances.paymentStatus,
      attendanceType: attendances.participationType,
      meetingTitle: meetings.title,
      meetingDate: meetings.date,
      clubName: clubs.name,
      clubShortName: clubs.shortName,
    })
    .from(attendances)
    .leftJoin(meetings, eq(attendances.meetingId, meetings.id))
    .leftJoin(clubs, eq(meetings.clubId, clubs.id))
    .where(and(
      isNull(attendances.userId),
      eq(attendances.externalEmail, userEmail),
      isNull(attendances.deletedAt),
      isNull(meetings.deletedAt),
      gte(meetings.date, todayStr),
    ))
    .orderBy(asc(meetings.date));

  // クラブのmuFeePersonalBurdenフラグを取得
  const clubInfo = clubId
    ? await db.select({ muFeePersonalBurden: clubs.muFeePersonalBurden })
        .from(clubs)
        .where(eq(clubs.id, clubId))
        .limit(1)
    : [];
  const isPersonalBurden = clubInfo[0]?.muFeePersonalBurden ?? false;

  // 自分のMU訪問報告履歴
  const myMuVisits = userId
    ? await db
        .select({
          id: muVisits.id,
          visitedClubName: muVisits.visitedClubName,
          visitDate: muVisits.visitDate,
          feeAmount: muVisits.feeAmount,
          note: muVisits.note,
          settlementStatus: muVisits.settlementStatus,
          createdAt: muVisits.createdAt,
        })
        .from(muVisits)
        .where(and(eq(muVisits.userId, userId), isNull(muVisits.deletedAt)))
        .orderBy(desc(muVisits.visitDate))
    : [];

  const [muHistory, countResult] = await Promise.all([
    db
      .select({
        id: attendances.id,
        meetingId: attendances.meetingId,
        feeAmount: attendances.feeAmount,
        paymentStatus: attendances.paymentStatus,
        registeredAt: attendances.registeredAt,
        meetingTitle: meetings.title,
        meetingDate: meetings.date,
        clubName: clubs.name,
        clubShortName: clubs.shortName,
      })
      .from(attendances)
      .leftJoin(meetings, eq(attendances.meetingId, meetings.id))
      .leftJoin(clubs, eq(meetings.clubId, clubs.id))
      .where(
        and(
          isNull(attendances.userId),
          eq(attendances.externalEmail, userEmail),
          isNull(attendances.deletedAt)
        )
      )
      .orderBy(desc(attendances.registeredAt))
      .limit(PAGE_SIZE)
      .offset(offset),

    db
      .select({ total: count() })
      .from(attendances)
      .where(
        and(
          isNull(attendances.userId),
          eq(attendances.externalEmail, userEmail),
          isNull(attendances.deletedAt)
        )
      ),
  ]);

  const muCount = countResult[0]?.total ?? 0;
  const totalPages = Math.ceil(muCount / PAGE_SIZE);

  const paidCount = muHistory.filter(a => a.paymentStatus === 'paid').length;
  const unpaidCount = muHistory.filter(a => a.paymentStatus !== 'paid').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/club/${slug}/dashboard`} className="p-1.5 rounded-full hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <History className="h-4 w-4 text-green-600" /> MU・出席履歴
          </h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* 今後の参加予定 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
            <CalendarCheck className="h-4 w-4 text-blue-500" />
            今後の参加予定
          </h2>
          <MyUpcomingAttendances attendances={upcomingAttendances as any} slug={slug} />
        </div>

        {/* 他クラブMU訪問報告 */}
        {userId && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-orange-500" />
              他クラブMU訪問報告
            </h2>
            <MuVisitReportForm isPersonalBurden={isPersonalBurden} />

            {/* MU訪問履歴 */}
            {myMuVisits.length > 0 && (
              <div className="bg-white rounded-xl border divide-y overflow-hidden mt-3">
                {myMuVisits.map((v) => (
                  <div key={v.id} className="p-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{v.visitedClubName}</p>
                      <p className="text-xs text-gray-500">{formatDate(v.visitDate)}</p>
                      {v.note && <p className="text-xs text-gray-400 truncate">{v.note}</p>}
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm font-mono text-gray-800">{formatCurrency(v.feeAmount)}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        v.settlementStatus === 'settled' ? 'bg-green-100 text-green-700' :
                        v.settlementStatus === 'personal' ? 'bg-blue-100 text-blue-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {v.settlementStatus === 'settled' ? '精算済' :
                         v.settlementStatus === 'personal' ? '個人負担' : '未精算'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* サマリー */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border p-3 text-center">
            <p className="text-xs text-gray-500">総件数</p>
            <p className="text-xl font-bold text-gray-800">{muCount}</p>
          </div>
          <div className="bg-white rounded-xl border p-3 text-center">
            <p className="text-xs text-gray-500">支払済</p>
            <p className="text-xl font-bold text-green-700">{paidCount}</p>
          </div>
          <div className="bg-white rounded-xl border p-3 text-center">
            <p className="text-xs text-gray-500">未払い</p>
            <p className="text-xl font-bold text-red-600">{unpaidCount}</p>
          </div>
        </div>

        {/* MU登録・出席履歴 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
            <History className="h-4 w-4 text-green-600" />
            MU登録・出席履歴
          </h2>
        {/* 一覧 */}
        {muHistory.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">MU登録履歴がありません</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border divide-y overflow-hidden">
            {muHistory.map((a) => (
              <div key={a.id} className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-purple-600 font-medium">
                    {a.clubShortName || a.clubName}
                  </p>
                  <p className="text-sm font-medium text-gray-900 truncate">{a.meetingTitle || '—'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {a.meetingDate ? formatDate(a.meetingDate) : '—'}
                  </p>
                </div>
                <div className="text-right ml-3">
                  <p className="text-sm font-mono text-gray-800">{formatCurrency(a.feeAmount)}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    a.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                    a.paymentStatus === 'exempt' ? 'bg-blue-100 text-blue-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {a.paymentStatus === 'paid' ? '支払済' :
                     a.paymentStatus === 'exempt' ? '免除' : '未払い'}
                  </span>
                </div>
              </div>
            ))}
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={muCount}
              pageSize={PAGE_SIZE}
              className="px-4 border-t"
            />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
