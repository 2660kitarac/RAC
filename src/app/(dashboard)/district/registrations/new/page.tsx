import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { districtEvents } from '@/lib/db/schema';
import { requireDistrictStaff } from '@/lib/event-registration/server';
import FormEditor, { type FormEditorInitialValues } from '@/components/district-registration/admin/FormEditor';

export const metadata = { title: '申込フォームの作成' };

export default async function NewRegistrationFormPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string | string[] }>;
}) {
  // 地区役員のみ
  const staff = await requireDistrictStaff();
  if (!staff.ok) redirect('/dashboard');

  // ?eventId=… があれば、その地区行事の情報を初期値として使う（担当地区の行事に限る）
  const sp = await searchParams;
  const eventIdParam = typeof sp.eventId === 'string' ? sp.eventId.slice(0, 64) : '';
  let event: { id: string; title: string; initialValues: FormEditorInitialValues } | null = null;
  if (eventIdParam && staff.districtId) {
    const [ev] = await staff.db
      .select({
        id: districtEvents.id,
        title: districtEvents.title,
        date: districtEvents.date,
        venueName: districtEvents.venueName,
        venueAddress: districtEvents.venueAddress,
        registrationDeadline: districtEvents.registrationDeadline,
        description: districtEvents.description,
      })
      .from(districtEvents)
      .where(and(
        eq(districtEvents.id, eventIdParam),
        eq(districtEvents.districtId, staff.districtId),
        isNull(districtEvents.deletedAt),
      ))
      .limit(1);
    if (ev) {
      const venue = ev.venueName && ev.venueAddress
        ? `${ev.venueName}（${ev.venueAddress}）`
        : (ev.venueName || ev.venueAddress || '');
      event = {
        id: ev.id,
        title: ev.title,
        initialValues: {
          title: ev.title,
          eventDate: ev.date || null,
          venue,
          deadline: ev.registrationDeadline || null,
          ...(ev.description ? { description: ev.description } : {}),
        },
      };
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <Link
        href={event ? '/district/events' : '/district/registrations'}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {event ? '地区行事' : '行事の申込管理'}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-gray-900">申込フォームの作成</h1>
      {event ? (
        <FormEditor
          mode="new"
          initialValues={event.initialValues}
          districtEventId={event.id}
          eventTitle={event.title}
        />
      ) : (
        <FormEditor mode="new" />
      )}
    </div>
  );
}
