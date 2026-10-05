/**
 * 地区への提出（クラブ役員用）
 * 報告書・Instagram 投稿を地区に提出し、審査結果（承認・差し戻し）を確認する
 */
import { redirect } from 'next/navigation';
import { getSubmitter, loadClubSubmissions } from '@/lib/district/submissions-server';
import { DistrictSubmissions } from '@/components/district-submissions/DistrictSubmissions';

export const metadata = { title: '地区への提出' };

export default async function DistrictSubmissionsPage() {
  const ctx = await getSubmitter();
  if (!ctx.ok) redirect(ctx.status === 401 ? '/login' : '/dashboard');
  const data = await loadClubSubmissions(ctx);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">地区への提出</h1>
        <p className="mt-1 text-sm text-gray-500">
          {data.club.name} から地区へ、報告書やInstagram投稿を提出します。地区の担当者が確認して「承認」または「差し戻し」をします。
        </p>
      </div>
      {!data.hasDistrict && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          クラブの地区が設定されていないため、まだ提出できません。システム管理者に連絡してください。
        </div>
      )}
      <DistrictSubmissions data={data} />
    </div>
  );
}
