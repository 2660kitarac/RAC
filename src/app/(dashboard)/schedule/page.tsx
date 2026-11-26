import { redirect } from 'next/navigation';
import { and, asc, eq, gte, isNull, lt } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings } from '@/lib/db/schema';
import { canAccessPage } from '@/lib/auth/page-access';
import { todayJst } from '@/lib/district/context';
import { monthKey, monthRange, parseMonth, shiftMonth } from '@/lib/calendar/month';
import { getFiscalYearLabel } from '@/lib/utils';
import ScheduleCalendar, { type ScheduleMeeting } from '@/components/schedule/ScheduleCalendar';

export const metadata = { title: '年間スケジュール' };

/**
 * 年間スケジュール（#61）
 * クラブアカウントが自クラブの例会を月カレンダーで確認し、追加・編集・削除に移れる画面。
 * データは例会（meetings）をそのまま使う。
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!canAccessPage(session.user.role, '/schedule')) redirect('/dashboard');

  const today = todayJst();
  const sp = await searchParams;
  const { y, m } = parseMonth(sp.month, today);
  const { start } = monthRange(y, m);
  const prev = shiftMonth(y, m, -1);
  const next = shiftMonth(y, m, 1);
  // 年度は7月始まり
  const fiscalLabel = getFiscalYearLabel(m >= 7 ? y : y - 1);

  const clubId = session.user.clubId;
  if (!clubId) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">年間スケジュール</h1>
        <p className="mt-4 rounded-lg border bg-white p-8 text-center text-gray-500">
          クラブが設定されていません。システム管理者にお問い合わせください。
        </p>
      </div>
    );
  }

  let items: ScheduleMeeting[] = [];
  let loadError = false;
  try {
    const db = await getDbFromContext();
    const rows = await db
      .select({
        id: meetings.id,
        title: meetings.title,
        date: meetings.date,
        startTime: meetings.startTime,
        endTime: meetings.endTime,
        venueName: meetings.venueName,
        status: meetings.status,
      })
      .from(meetings)
      .where(and(
        eq(meetings.clubId, clubId),
        isNull(meetings.deletedAt),
        gte(meetings.date, start),
        // 翌月1日より前（date に時刻が付いていても月末日を取りこぼさない）
        lt(meetings.date, `${monthKey(next.y, next.m)}-01`),
      ))
      .orderBy(asc(meetings.date), asc(meetings.startTime));
    items = rows.map((r) => ({ ...r, date: r.date.slice(0, 10) }));
  } catch (e) {
    console.error('[schedule] 例会の取得に失敗:', e);
    loadError = true;
  }

  return (
    <ScheduleCalendar
      year={y}
      month={m}
      today={today}
      fiscalLabel={fiscalLabel}
      prevMonth={monthKey(prev.y, prev.m)}
      nextMonth={monthKey(next.y, next.m)}
      meetings={items}
      loadError={loadError}
    />
  );
}
