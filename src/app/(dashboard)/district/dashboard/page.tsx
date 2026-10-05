import { requireDistrictPage, racYearRange, todayJst } from '@/lib/district/context';
import { getDashboardData } from '@/lib/district/stats';
import { USER_ROLE_LABELS, type UserRole } from '@/types';
import DistrictDashboard from '@/components/district/dashboard/DistrictDashboard';
import NoDistrict from '@/components/district/dashboard/NoDistrict';

export const metadata = { title: '地区ダッシュボード' };

export default async function DistrictDashboardPage() {
  const { db, user, district } = await requireDistrictPage();
  if (!district) return <NoDistrict title="地区ダッシュボード" />;

  const today = todayJst();
  const year = racYearRange(today);
  const data = await getDashboardData(db, district.id, year, today);
  const roleLabel = USER_ROLE_LABELS[user.role as UserRole] ?? user.role;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{district.label} ダッシュボード</h1>
        <p className="mt-1 text-sm text-gray-500">
          {year.label}・{user.name}さん（{roleLabel}）
        </p>
      </div>
      <DistrictDashboard data={data} />
    </div>
  );
}
