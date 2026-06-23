import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs } from '@/lib/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import ClubsList from '@/components/clubs/ClubsList';

export const metadata = { title: 'クラブ管理' };

export default async function ClubsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();

  // ユーザーのdistrictId取得
  const profileResult = await db
    .select({
      id: users.id,
      clubId: users.clubId,
      districtId: users.districtId,
      role: users.role,
      clubDistrictId: clubs.districtId,
    })
    .from(users)
    .leftJoin(clubs, eq(users.clubId, clubs.id))
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
    .limit(1);

  const profile = profileResult[0];
  const userRole = profile?.role;

  // system_owner は全クラブを表示。それ以外は districtId でフィルタ
  const isSystemOwner = userRole === 'system_owner';
  const districtId = profile?.districtId ?? profile?.clubDistrictId ?? null;

  const clubsResult = await db
    .select()
    .from(clubs)
    .where(
      isSystemOwner || !districtId
        ? isNull(clubs.deletedAt)
        : and(eq(clubs.districtId, districtId), isNull(clubs.deletedAt))
    )
    .orderBy(asc(clubs.name));

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">クラブ管理</h1>
        <p className="text-sm text-gray-500 mt-1">地区内のクラブ・団体の管理</p>
      </div>
      <ClubsList
        clubs={clubsResult as any}
        zones={[]}
        currentClubId={session.user.clubId || null}
        userRole={session.user.role || 'system_owner'}
      />
    </div>
  );
}
