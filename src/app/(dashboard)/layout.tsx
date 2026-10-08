import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, clubReports, instagramPosts } from '@/lib/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { isDistrictStaff } from '@/lib/auth/tenant';
import { resolveDistrict } from '@/lib/district/context';
import type { DistrictBadges } from '@/components/layout/Sidebar';

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }
  // 初期パスワードのままの人は、先にパスワードを設定してもらう
  if (session.user.mustChangePassword) {
    redirect('/change-password');
  }

  let profile = null;
  let districtLabel: string | null = null;
  let districtBadges: DistrictBadges | undefined;

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

    // 地区役員：地区名と審査待ちの件数（サイドバーのバッジ）
    if (profile && isDistrictStaff(profile.role)) {
      try {
        const [me] = await db
          .select({ districtId: users.districtId, clubId: users.clubId })
          .from(users)
          .where(eq(users.id, profile.id))
          .limit(1);
        const district = await resolveDistrict(db, { districtId: me?.districtId ?? null, clubId: me?.clubId ?? null, role: profile.role });
        districtLabel = district?.label ?? null;
        if (district) {
          const [r] = await db
            .select({ n: sql<number>`count(*)::int` })
            .from(clubReports)
            .where(and(eq(clubReports.districtId, district.id), eq(clubReports.status, 'submitted'), isNull(clubReports.deletedAt)));
          const [ig] = await db
            .select({ n: sql<number>`count(*)::int` })
            .from(instagramPosts)
            .where(and(eq(instagramPosts.districtId, district.id), eq(instagramPosts.status, 'pending'), isNull(instagramPosts.deletedAt)));
          districtBadges = { reports: r?.n ?? 0, instagram: ig?.n ?? 0 };
        }
      } catch (e) {
        console.error('[DashboardLayout] district info error:', e);
      }
    }
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
    <DashboardLayout user={profile as any} districtLabel={districtLabel} districtBadges={districtBadges}>
      {children}
    </DashboardLayout>
  );
}
