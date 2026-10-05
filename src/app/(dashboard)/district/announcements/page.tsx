import { and, desc, eq, isNull } from 'drizzle-orm';
import { districtAnnouncements } from '@/lib/db/schema';
import { requireDistrictPage, todayJst } from '@/lib/district/context';
import { sortAnnouncements, toAnnouncementView, type AnnouncementView } from '@/lib/district/announcements';
import AnnouncementsManager from '@/components/district/announcements/AnnouncementsManager';

export const metadata = { title: '地区からのお知らせ' };

export default async function DistrictAnnouncementsPage() {
  const { db, district } = await requireDistrictPage();

  if (!district) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">地区からのお知らせ</h1>
        <p className="mt-4 rounded-lg border bg-white p-8 text-center text-gray-500">
          地区が設定されていません。システム管理者にお問い合わせください。
        </p>
      </div>
    );
  }

  let announcements: AnnouncementView[] = [];
  let loadError = false;
  try {
    const rows = await db
      .select()
      .from(districtAnnouncements)
      .where(and(eq(districtAnnouncements.districtId, district.id), isNull(districtAnnouncements.deletedAt)))
      .orderBy(desc(districtAnnouncements.createdAt))
      .limit(500);
    announcements = sortAnnouncements(rows.map(toAnnouncementView));
  } catch (e) {
    console.error('district announcements page error:', e);
    loadError = true;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">地区からのお知らせ</h1>
        <p className="text-sm text-gray-500 mt-1">
          {district.label}の各クラブ・会員のダッシュボードに表示されるお知らせを作成します
        </p>
      </div>
      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          お知らせを読み込めませんでした。時間をおいて再度お試しください。
        </p>
      ) : (
        <AnnouncementsManager initialAnnouncements={announcements} today={todayJst()} />
      )}
    </div>
  );
}
