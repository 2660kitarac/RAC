import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import UserRoleManagement from '@/components/users/UserRoleManagement';

export const metadata = { title: 'ユーザー権限管理' };

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const clubId = session.user.clubId;

  const userWhere = clubId
    ? and(eq(users.clubId, clubId), isNull(users.deletedAt))
    : isNull(users.deletedAt);

  const usersResult = await db
    .select()
    .from(users)
    .where(userWhere)
    .orderBy(asc(users.role), asc(users.name));

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ユーザー権限管理</h1>
        <p className="text-sm text-gray-500 mt-1">クラブメンバーの役割・権限を管理します</p>
      </div>
      <UserRoleManagement
        users={usersResult as any}
        currentUserId={session.user.id}
        clubId={clubId || ''}
        userRole={session.user.role || 'system_owner'}
      />
    </div>
  );
}
