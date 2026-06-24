import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import DashboardLayout from '@/components/layout/DashboardLayout';

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  let profile = null;

  try {
    const db = await getDbFromContext();

    // ユーザープロフィール取得（クラブ情報含む）
    const result = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        memberType: users.memberType,
        clubId: users.clubId,
        position: users.position,
        isActive: users.isActive,
        club: {
          id: clubs.id,
          name: clubs.name,
          shortName: clubs.shortName,
          slug: clubs.slug,
        },
      })
      .from(users)
      .leftJoin(clubs, eq(users.clubId, clubs.id))
      .where(
        and(
          eq(users.id, session.user.id),
          isNull(users.deletedAt)
        )
      )
      .limit(1);

    profile = result[0] ?? null;
  } catch (error) {
    console.error('[DashboardLayout] DB error:', error);
    // DBエラーでもレイアウトは表示する（セッション情報のみ使用）
    profile = {
      id: session.user.id,
      name: session.user.name ?? '',
      email: session.user.email ?? '',
      role: (session.user as any).role ?? 'member',
      memberType: 'RAC',
      clubId: (session.user as any).clubId ?? null,
      position: null,
      isActive: true,
      club: null,
    };
  }

  return (
    <DashboardLayout user={profile as any}>
      {children}
    </DashboardLayout>
  );
}
