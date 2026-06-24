import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, districts } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { isDistrictStaff } from '@/lib/hooks/useAuth';
import AwardsSettings from '@/components/awards/AwardsSettings';

export const metadata = { title: '表彰設定' };

export default async function AwardsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const profile = await db
    .select({ id: users.id, role: users.role, clubId: users.clubId, districtId: users.districtId })
    .from(users)
    .where(and(eq(users.id, session.user.id!), isNull(users.deletedAt)))
    .get();

  const role = profile?.role || 'system_owner';
  if (!isDistrictStaff(role as any)) redirect('/dashboard');

  let districtId = profile?.districtId;
  if (!districtId && profile?.clubId) {
    const club = await db.select({ districtId: clubs.districtId }).from(clubs).where(eq(clubs.id, profile.clubId)).get();
    districtId = club?.districtId ?? undefined;
  }
  if (!districtId) {
    const first = await db.select({ id: districts.id }).from(districts).where(isNull(districts.deletedAt)).get();
    districtId = first?.id;
  }

  if (!districtId) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">表彰設定</h1>
        <p className="mt-4 text-gray-500">地区データがまだ登録されていません。</p>
      </div>
    );
  }

  const currentYear = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  // award_score_items / award_settings は D1 未定義テーブル（将来実装）
  // TODO: スキーマ定義後に Drizzle クエリへ置き換える
  const scoreItems: any[] = [];
  const awardSetting: any = null;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">表彰設定</h1>
        <p className="text-sm text-gray-500 mt-1">{currentYear}年度 表彰項目・点数の設定</p>
      </div>
      <AwardsSettings
        scoreItems={scoreItems}
        awardSetting={awardSetting}
        districtId={districtId}
        currentYear={currentYear}
        userRole={role}
      />
    </div>
  );
}
