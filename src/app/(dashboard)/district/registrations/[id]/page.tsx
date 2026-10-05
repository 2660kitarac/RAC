import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { loadStaffForm, requireDistrictStaff } from '@/lib/event-registration/server';
import RegistrationDashboard from '@/components/district-registration/admin/RegistrationDashboard';

export const metadata = { title: '申込の管理' };

export default async function RegistrationFormDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  // 地区役員のみ
  const staff = await requireDistrictStaff();
  if (!staff.ok) redirect('/dashboard');

  const { id } = await params;
  const found = await loadStaffForm(staff.db, id, { role: staff.user.role, districtId: staff.districtId });
  if (!found) notFound();

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <Link href="/district/registrations" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" />
        行事の申込管理
      </Link>
      <RegistrationDashboard formId={found.form.id} />
    </div>
  );
}
