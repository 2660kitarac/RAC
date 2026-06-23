/**
 * GET /api/approvals
 * 自クラブの pending ユーザー一覧を返す（club_account / 管理者向け）
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const userRole = session.user.role || '';
    const isAdmin = ['system_owner', 'district_admin'].includes(userRole);
    const isClubAccount = userRole === 'club_account';

    if (!isAdmin && !isClubAccount) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const db = getDbFromContext();
    const { searchParams } = new URL(request.url);
    const clubIdParam = searchParams.get('clubId');

    // club_account は自クラブのみ
    const targetClubId = isClubAccount
      ? ((session.user as any).clubId as string | null)
      : (clubIdParam || null);

    if (!targetClubId && !isAdmin) {
      return NextResponse.json({ error: 'クラブIDが設定されていません' }, { status: 400 });
    }

    const conditions = [eq(users.status, 'pending'), isNull(users.deletedAt)];
    if (targetClubId) {
      conditions.push(eq(users.clubId, targetClubId));
    }

    const pendingUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        nameKana: users.nameKana,
        createdAt: users.createdAt,
        clubId: users.clubId,
        clubName: clubs.name,
      })
      .from(users)
      .leftJoin(clubs, eq(users.clubId, clubs.id))
      .where(and(...(conditions as [any, ...any[]])))
      .orderBy(users.createdAt);

    return NextResponse.json(pendingUsers);
  } catch (error) {
    console.error('GET /api/approvals error:', error);
    return NextResponse.json({ error: '承認待ちユーザーの取得に失敗しました' }, { status: 500 });
  }
}
