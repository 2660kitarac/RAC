import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, districts, districtEvents, clubReports } from '@/lib/db/schema';
import { eq, and, isNull, gte, asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { isDistrictStaff } from '@/lib/hooks/useAuth';
import DistrictDashboardContent from '@/components/district/DistrictDashboardContent';

export const metadata = { title: '地区ダッシュボード' };

export default async function DistrictDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();
  const userId = session.user.id;

  const profile = await db
    .select({ id: users.id, role: users.role, clubId: users.clubId, districtId: users.districtId })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .then((r:any[])=>r[0]);

  const role = (profile?.role || 'member') as any;
  if (!isDistrictStaff(role)) redirect('/dashboard');

  // districtId 解決
  let effectiveDistrictId = profile?.districtId;
  if (!effectiveDistrictId && profile?.clubId) {
    const club = await db.select({ districtId: clubs.districtId }).from(clubs).where(eq(clubs.id, profile.clubId)).then((r:any[])=>r[0]);
    effectiveDistrictId = club?.districtId ?? null;
  }
  if (!effectiveDistrictId) {
    const first = await db.select({ id: districts.id }).from(districts).where(isNull(districts.deletedAt)).limit(1).then((r:any[])=>r[0]);
    effectiveDistrictId = first?.id ?? null;
  }

  if (!effectiveDistrictId) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">地区ダッシュボード</h1>
        <p className="mt-4 text-gray-500">地区データがまだ登録されていません。</p>
      </div>
    );
  }

  const currentYear = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const today = new Date().toISOString().split('T')[0];

  const [clubsResult, upcomingEventsResult, pendingReportsResult] = await Promise.all([
    db.select({
      id: clubs.id, name: clubs.name, shortName: clubs.shortName,
      type: clubs.type, zoneId: clubs.zoneId, isActive: clubs.isActive,
    }).from(clubs)
      .where(and(eq(clubs.districtId, effectiveDistrictId), eq(clubs.type, 'RAC'), isNull(clubs.deletedAt)))
      .orderBy(clubs.name),
    db.select().from(districtEvents)
      .where(and(
        eq(districtEvents.districtId, effectiveDistrictId),
        gte(districtEvents.date, today),
        isNull(districtEvents.deletedAt),
      ))
      .orderBy(asc(districtEvents.date))
      .limit(5)
      .catch(() => []),
    db.select({
      id: clubReports.id, clubId: clubReports.clubId,
      title: clubReports.title, status: clubReports.status, deadline: clubReports.deadline,
    }).from(clubReports)
      .where(and(
        eq(clubReports.districtId, effectiveDistrictId),
        eq(clubReports.status, 'submitted'),
        isNull(clubReports.deletedAt),
      ))
      .limit(10)
      .catch(() => []),
  ]);

  // award_scores は Priority 2 実装予定 → 空配列で代替
  const clubScoreMap: Record<string, number> = {};

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">地区ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-1">{currentYear}年度 地区全体の状況</p>
      </div>
      <DistrictDashboardContent
        clubs={clubsResult as any}
        upcomingEvents={upcomingEventsResult as any}
        pendingReports={pendingReportsResult as any}
        clubScoreMap={clubScoreMap}
        currentYear={currentYear}
      />
    </div>
  );
}
