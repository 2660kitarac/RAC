import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubs, users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import ClubAccountsContent from '@/components/clubs/ClubAccountsContent';

export const metadata = { title: 'クラブアカウント管理' };

export default async function ClubAccountsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if ((session.user as any).status === 'pending') redirect('/pending');

  const userRole = session.user.role || '';
  if (!['system_owner', 'district_admin'].includes(userRole)) redirect('/dashboard');

  const db = getDbFromContext();

  // クラブ一覧取得
  const clubList = await db
    .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName })
    .from(clubs)
    .where(isNull(clubs.deletedAt))
    .orderBy(clubs.name);

  // 既存の club_account ユーザー一覧
  const clubAccounts = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      clubId: users.clubId,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.role, 'club_account'), isNull(users.deletedAt)));

  return (
    <ClubAccountsContent
      clubs={clubList}
      clubAccounts={clubAccounts}
    />
  );
}
