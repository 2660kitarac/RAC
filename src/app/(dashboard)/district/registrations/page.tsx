import { redirect } from 'next/navigation';
import { requireDistrictStaff } from '@/lib/event-registration/server';
import FormsList from '@/components/district-registration/admin/FormsList';

export const metadata = { title: '行事の申込管理' };

export default async function DistrictRegistrationsPage() {
  // 地区役員のみ
  const staff = await requireDistrictStaff();
  if (!staff.ok) redirect('/dashboard');

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">行事の申込管理</h1>
        <p className="text-sm text-gray-500 mt-1">
          地区行事の申込フォームを作成し、各クラブからの申込・入金状況を地区役員みんなで確認できます
        </p>
      </div>
      <FormsList />
    </div>
  );
}
