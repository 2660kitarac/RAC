import { notFound } from 'next/navigation';
import { requireDistrictPage, racYearRange, todayJst } from '@/lib/district/context';
import { getClubDetail } from '@/lib/district/stats';
import ClubDetailView from '@/components/district/clubs/ClubDetailView';
import NoDistrict from '@/components/district/dashboard/NoDistrict';

export const metadata = { title: 'クラブの状況（地区）' };

export default async function DistrictClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, district } = await requireDistrictPage();
  if (!district) return <NoDistrict title="クラブの状況" />;

  const today = todayJst();
  const year = racYearRange(today);
  // 担当地区のクラブでなければ表示しない
  const detail = await getClubDetail(db, district.id, id, year, today);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <ClubDetailView detail={detail} yearLabel={year.label} />
    </div>
  );
}
