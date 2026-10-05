import { requireDistrictPage, racYearRange, todayJst } from '@/lib/district/context';
import { getClubsWithStats } from '@/lib/district/stats';
import ClubsList from '@/components/district/clubs/ClubsList';
import NoDistrict from '@/components/district/dashboard/NoDistrict';

export const metadata = { title: 'クラブ一覧（地区）' };

export default async function DistrictClubsPage() {
  const { db, district } = await requireDistrictPage();
  if (!district) return <NoDistrict title="クラブ一覧" />;

  const today = todayJst();
  const year = racYearRange(today);
  const clubs = await getClubsWithStats(db, district.id, year, today);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">クラブ一覧</h1>
        <p className="mt-1 text-sm text-gray-500">
          {district.label}の{clubs.length}クラブ（{year.label}）。クラブ名を押すと詳しい状況が見られます。
        </p>
      </div>
      <ClubsList clubs={clubs} />
    </div>
  );
}
