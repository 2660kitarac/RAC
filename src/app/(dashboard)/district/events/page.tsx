import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, districts, districtEvents } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { isDistrictStaff } from '@/lib/hooks/useAuth';
import DistrictEventsList from '@/components/district/DistrictEventsList';

export const metadata = { title: '地区行事管理' };

export default async function DistrictEventsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();
  const userId = session.user.id;

  const profile = await db
    .select({ id: users.id, role: users.role, clubId: users.clubId, districtId: users.districtId })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .then((r:any[])=>r[0]);

  const role = (profile?.role || 'member') as any;
  if (!isDistrictStaff(role)) redirect('/dashboard');

  let districtId = profile?.districtId;
  if (!districtId && profile?.clubId) {
    const club = await db.select({ districtId: clubs.districtId }).from(clubs).where(eq(clubs.id, profile.clubId)).then((r:any[])=>r[0]);
    districtId = club?.districtId ?? null;
  }
  if (!districtId) {
    const first = await db.select({ id: districts.id }).from(districts).where(isNull(districts.deletedAt)).limit(1).then((r:any[])=>r[0]);
    districtId = first?.id ?? null;
  }

  if (!districtId) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">地区行事管理</h1>
        <p className="mt-4 text-gray-500">地区データがまだ登録されていません。</p>
      </div>
    );
  }

  const [eventsResult, clubsResult] = await Promise.all([
    db.select().from(districtEvents)
      .where(and(eq(districtEvents.districtId, districtId), isNull(districtEvents.deletedAt)))
      .orderBy(desc(districtEvents.date))
      .catch(() => []),
    db.select({ id: clubs.id, name: clubs.name }).from(clubs)
      .where(and(eq(clubs.districtId, districtId), isNull(clubs.deletedAt)))
      .orderBy(clubs.name)
      .catch(() => []),
  ]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">地区行事管理</h1>
        <p className="text-sm text-gray-500 mt-1">地区・ゾーン主催の行事を管理します</p>
      </div>
      <DistrictEventsList
        events={eventsResult as any}
        clubs={clubsResult as any}
        districtId={districtId}
        userRole={role}
      />
    </div>
  );
}
