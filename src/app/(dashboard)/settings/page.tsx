import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import SettingsPage from '@/components/settings/SettingsPage';

export const metadata = { title: '設定' };

export default async function Settings() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const result = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      memberType: users.memberType,
      phone: users.phone,
      clubId: users.clubId,
      club: {
        id: clubs.id,
        name: clubs.name,
        shortName: clubs.shortName,
        slug: clubs.slug,
      },
    })
    .from(users)
    .leftJoin(clubs, eq(users.clubId, clubs.id))
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
    .limit(1);

  const profile = result[0] ?? null;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="text-sm text-gray-500 mt-1">プロフィール・クラブ設定を管理します</p>
      </div>
      {profile ? (
        <SettingsPage profile={profile as any} club={profile.club as any} />
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800">プロフィール情報を取得できませんでした。</p>
          <p className="text-sm text-yellow-600 mt-1">ページを再読み込みしてください。</p>
        </div>
      )}
    </div>
  );
}
