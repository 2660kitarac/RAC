import { and, eq, isNull } from 'drizzle-orm';
import { clubs } from '@/lib/db/schema';
import { canManageDistrictOfficers } from '@/lib/auth/tenant';
import { requireDistrictPage } from '@/lib/district/context';
import { listOfficers, type OfficerRow } from '@/app/api/district/officers/_shared';
import OfficersManager from '@/components/district/officers/OfficersManager';

export const metadata = { title: '地区役員アカウント' };

export default async function DistrictOfficersPage() {
  const { db, user, district } = await requireDistrictPage();

  if (!district) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">地区役員アカウント</h1>
        <p className="mt-4 rounded-lg border bg-white p-8 text-center text-gray-500">
          地区が設定されていません。システム管理者にお問い合わせください。
        </p>
      </div>
    );
  }

  let officers: OfficerRow[] = [];
  let clubOptions: { id: string; name: string }[] = [];
  let loadError = false;
  try {
    [officers, clubOptions] = await Promise.all([
      listOfficers(db, district.id),
      db.select({ id: clubs.id, name: clubs.name })
        .from(clubs)
        .where(and(eq(clubs.districtId, district.id), isNull(clubs.deletedAt), eq(clubs.isSystemClub, false)))
        .orderBy(clubs.name),
    ]);
  } catch (e) {
    console.error('district officers page error:', e);
    loadError = true;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">地区役員アカウント</h1>
        <p className="text-sm text-gray-500 mt-1">
          {district.label}の地区役員のログインアカウントを管理します
        </p>
      </div>
      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          地区役員の一覧を読み込めませんでした。時間をおいて再度お試しください。
        </p>
      ) : (
        <OfficersManager
          initialOfficers={officers}
          clubs={clubOptions}
          me={{ id: user.id, role: user.role }}
          canManage={canManageDistrictOfficers(user.role)}
        />
      )}
    </div>
  );
}
