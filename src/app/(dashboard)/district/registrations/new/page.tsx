import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireDistrictStaff } from '@/lib/event-registration/server';
import FormEditor from '@/components/district-registration/admin/FormEditor';

export const metadata = { title: '申込フォームの作成' };

export default async function NewRegistrationFormPage() {
  // 地区役員のみ
  const staff = await requireDistrictStaff();
  if (!staff.ok) redirect('/dashboard');

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <Link href="/district/registrations" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" />
        行事の申込管理
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-gray-900">申込フォームの作成</h1>
      <FormEditor mode="new" />
    </div>
  );
}
