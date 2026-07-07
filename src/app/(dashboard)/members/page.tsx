import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs } from '@/lib/db/schema';
import { eq, and, isNull, like, or, count, asc } from 'drizzle-orm';
import MembersList from '@/components/members/MembersList';

export const metadata = { title: '会員管理' };

const PAGE_SIZE = 50;

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const search = params.search || '';
  const status = params.status || 'active';
  const offset = (page - 1) * PAGE_SIZE;

  // セッションからclubId取得
  const clubId = session.user.clubId;

  // WHERE条件を組み立て
  const baseWhere = [isNull(users.deletedAt)];
  if (clubId) baseWhere.push(eq(users.clubId, clubId));
  if (status === 'active') baseWhere.push(eq(users.isActive, true));
  else if (status === 'inactive') baseWhere.push(eq(users.isActive, false));

  // 検索付きクエリ（SQLite の LIKE は大文字小文字を区別しないデフォルト）
  const buildWhere = () => {
    if (!search) return and(...baseWhere);
    const likeStr = `%${search}%`;
    return and(
      ...baseWhere,
      or(like(users.name, likeStr), like(users.email, likeStr))
    );
  };

  const [countResult, membersResult, clubsResult] = await Promise.all([
    db.select({ value: count() })
      .from(users)
      .where(buildWhere()),

    db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      position: users.position,
      // MembersList コンポーネントが参照する snake_case フィールド名に合わせる
      member_type: users.memberType,
      is_active: users.isActive,
      phone: users.phone,
      joined_date: users.joinedAt,
      name_kana: users.nameKana,
      club_id: users.clubId,
      memo: users.memo,
      club: {
        id: clubs.id,
        name: clubs.name,
        short_name: clubs.shortName,
      },
    })
      .from(users)
      .leftJoin(clubs, eq(users.clubId, clubs.id))
      .where(buildWhere())
      .orderBy(asc(users.name))
      .limit(PAGE_SIZE)
      .offset(offset),

    db.select({ id: clubs.id, name: clubs.name, short_name: clubs.shortName })
      .from(clubs)
      .where(isNull(clubs.deletedAt))
      .orderBy(asc(clubs.name)),
  ]);

  const totalCount = countResult[0]?.value || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <MembersList
      members={membersResult as any}
      clubs={clubsResult as any}
      currentUserClubId={clubId || null}
      userRole={session.user.role || 'system_owner'}
      pagination={{ page, totalPages, totalCount, pageSize: PAGE_SIZE }}
      filters={{ search, status }}
    />
  );
}
