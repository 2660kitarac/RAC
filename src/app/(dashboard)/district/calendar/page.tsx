import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, districts, districtEvents } from '@/lib/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { isDistrictStaff } from '@/lib/hooks/useAuth';
import { formatTime } from '@/lib/utils';

export const metadata = { title: 'カレンダー管理' };

export default async function DistrictCalendarPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const profile = await db
    .select({ id: users.id, role: users.role, clubId: users.clubId, districtId: users.districtId })
    .from(users)
    .where(and(eq(users.id, session.user.id!), isNull(users.deletedAt)))
    .then((r:any[])=>r[0]);

  if (!isDistrictStaff((profile?.role || 'system_owner') as any)) redirect('/dashboard');

  let effectiveDistrictId = profile?.districtId;
  if (!effectiveDistrictId && profile?.clubId) {
    const club = await db.select({ districtId: clubs.districtId }).from(clubs).where(eq(clubs.id, profile.clubId)).then((r:any[])=>r[0]);
    effectiveDistrictId = club?.districtId ?? undefined;
  }
  if (!effectiveDistrictId) {
    const first = await db.select({ id: districts.id }).from(districts).where(isNull(districts.deletedAt)).then((r:any[])=>r[0]);
    effectiveDistrictId = first?.id;
  }

  // district_events を Drizzle ORM で取得
  let events: any[] = [];
  if (effectiveDistrictId) {
    const rows = await db
      .select()
      .from(districtEvents)
      .where(and(
        eq(districtEvents.districtId, effectiveDistrictId),
        isNull(districtEvents.deletedAt),
      ))
      .orderBy(asc(districtEvents.date))
      .catch(() => []);
    // テンプレート変数名に合わせてスネークケースに変換
    events = rows.map((e: any) => ({
      ...e,
      event_type: e.eventType,
      start_time: e.startTime,
      end_time: e.endTime,
      venue_name: e.venueName,
      venue_address: e.venueAddress,
      is_award_target: e.isAwardTarget,
      is_joint_meeting: e.isJointMeeting,
    }));
  }

  // 月別グルーピング
  const eventsByMonth: Record<string, any[]> = {};
  events.forEach((e: any) => {
    const monthKey = e.date.substring(0, 7);
    if (!eventsByMonth[monthKey]) eventsByMonth[monthKey] = [];
    eventsByMonth[monthKey].push(e);
  });

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">カレンダー管理</h1>
          <p className="text-sm text-gray-500 mt-1">地区・クラブの年間スケジュール</p>
        </div>
        <a href="/district/events" className="text-sm text-blue-600 hover:underline">
          行事を追加 →
        </a>
      </div>

      {Object.keys(eventsByMonth).length === 0 ? (
        <div className="bg-white border rounded-xl p-16 text-center text-gray-400">
          <p>登録されている行事がありません</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(eventsByMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, monthEvents]) => {
            const [year, mon] = month.split('-');
            return (
              <div key={month} className="bg-white border rounded-xl overflow-hidden">
                <div className="bg-blue-600 text-white px-4 py-3">
                  <h2 className="font-bold">{year}年 {parseInt(mon)}月</h2>
                </div>
                <div className="divide-y">
                  {monthEvents.map((event: any) => (
                    <div key={event.id} className="flex items-start gap-4 p-4 hover:bg-gray-50">
                      <div className="flex-shrink-0 text-center w-10">
                        <p className="text-2xl font-bold text-gray-800">{new Date(event.date).getDate()}</p>
                        <p className="text-xs text-gray-500">
                          {['日', '月', '火', '水', '木', '金', '土'][new Date(event.date).getDay()]}
                        </p>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900">{event.title}</p>
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{event.event_type}</span>
                          {event.is_award_target && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">表彰</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {event.start_time ? formatTime(event.start_time) : ''}
                          {event.venue_name ? ` / ${event.venue_name}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
