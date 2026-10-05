import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { eventRegistrations } from '@/lib/db/schema';
import { loadStaffForm, requireDistrictStaff } from '@/lib/event-registration/server';
import FormEditor from '@/components/district-registration/admin/FormEditor';

export const metadata = { title: '申込フォームの設定' };

export default async function RegistrationFormSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  // 地区役員のみ
  const staff = await requireDistrictStaff();
  if (!staff.ok) redirect('/dashboard');

  const { id } = await params;
  const found = await loadStaffForm(staff.db, id, { role: staff.user.role, districtId: staff.districtId });
  if (!found) notFound();

  // 申込が入っているか（設定変更時の注意書き用。取り消し分も含める）
  const regs: Array<{ id: string }> = await staff.db
    .select({ id: eventRegistrations.id })
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.formId, found.form.id), isNull(eventRegistrations.deletedAt)));

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <Link href={`/district/registrations/${found.form.id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" />
        {found.config.title}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-gray-900">申込フォームの設定</h1>
      <FormEditor mode="settings" formId={found.form.id} initialConfig={found.config} registrationCount={regs.length} />
    </div>
  );
}
