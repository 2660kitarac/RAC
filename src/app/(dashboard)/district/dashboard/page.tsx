import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, districts } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
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
    .get();

  const role = (profile?.role || 'member') as any;
  if (!isDistrictStaff(role)) redirect('/dashboard');

  // districtId 解決
  let effectiveDistrictId = profile?.districtId;
  if (!effectiveDistrictId && profile?.clubId) {
    const club = await db.select({ districtId: clubs.districtId }).from(clubs).where(eq(clubs.id, profile.clubId)).get();
    effectiveDistrictId = club?.districtId ?? null;
  }
  if (!effectiveDistrictId) {
    const first = await db.select({ id: districts.id }).from(districts).where(isNull(districts.deletedAt)).limit(1).get();
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

  const [clubsResult, upcomingEventsResult, awardScoresResult, pendingReportsResult] = await Promise.all([
    d1.prepare(`SELECT id, name, short_name, type, zone_id, is_active FROM clubs WHERE district_id=? AND type='RAC' AND deleted_at IS NULL ORDER BY name`).bind(effectiveDistrictId).all(),
    d1.prepare(`SELECT * FROM district_events WHERE district_id=? AND date>=? AND deleted_at IS NULL ORDER BY date LIMIT 5`).bind(effectiveDistrictId, today).all().catch(() => ({ results: [] })),
    d1.prepare(`SELECT club_id, score_item_code, score FROM award_scores WHERE district_id=? AND fiscal_year=? AND deleted_at IS NULL`).bind(effectiveDistrictId, currentYear).all().catch(() => ({ results: [] })),
    d1.prepare(`SELECT id, club_id, title, status, deadline FROM club_reports WHERE district_id=? AND status='submitted' AND deleted_at IS NULL LIMIT 10`).bind(effectiveDistrictId).all().catch(() => ({ results: [] })),
  ]);

  // クラブ別スコア集計
  const clubScoreMap: Record<string, number> = {};
  ((awardScoresResult as any).results ?? []).forEach((s: any) => {
    clubScoreMap[s.club_id] = (clubScoreMap[s.club_id] ?? 0) + s.score;
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">地区ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-1">{currentYear}年度 地区全体の状況</p>
      </div>
      <DistrictDashboardContent
        clubs={((clubsResult as any).results ?? []) as any}
        upcomingEvents={((upcomingEventsResult as any).results ?? []) as any}
        pendingReports={((pendingReportsResult as any).results ?? []) as any}
        clubScoreMap={clubScoreMap}
        currentYear={currentYear}
      />
    </div>
  );
}
