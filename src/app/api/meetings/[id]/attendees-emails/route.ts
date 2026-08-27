import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances, users, meetings } from '@/lib/db/schema';
import { eq, isNull, and, isNotNull } from 'drizzle-orm';
import { canMutateClubRecord, canManageClub } from '@/lib/auth/tenant';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    // 参加者の氏名とメールアドレスを返すため、運営ロールに限定する
    if (!canManageClub(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id: meetingId } = await params;
    const db = await getDbFromContext();

    // IDOR 対策: 対象例会が自クラブのものか検証する
    // （他クラブ参加者の個人情報が漏洩するのを防ぐ）
    const [meeting] = await db
      .select({ id: meetings.id, clubId: meetings.clubId })
      .from(meetings)
      .where(and(eq(meetings.id, meetingId), isNull(meetings.deletedAt)))
      .limit(1);

    if (!meeting) return NextResponse.json({ error: '例会が見つかりません' }, { status: 404 });
    if (!canMutateClubRecord(session.user, meeting.clubId)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    // 外部参加者（MU登録）
    const external = await db
      .select({
        id: attendances.id,
        name: attendances.externalName,
        email: attendances.externalEmail,
      })
      .from(attendances)
      .where(and(
        eq(attendances.meetingId, meetingId),
        isNull(attendances.userId),
        isNotNull(attendances.externalEmail),
        isNull(attendances.deletedAt),
      ));

    // 内部会員
    const internal = await db
      .select({
        id: attendances.id,
        name: users.name,
        email: users.email,
      })
      .from(attendances)
      .innerJoin(users, eq(attendances.userId, users.id))
      .where(and(
        eq(attendances.meetingId, meetingId),
        isNotNull(attendances.userId),
        isNull(attendances.deletedAt),
      ));

    const attendees = [
      ...external
        .filter((r: any) => r.email)
        .map((r: any) => ({ id: r.id, name: r.name || '(名前なし)', email: r.email! })),
      ...internal
        .filter((r: any) => r.email)
        .map((r: any) => ({ id: r.id, name: r.name || '(名前なし)', email: r.email! })),
    ];

    return NextResponse.json({ attendees });
  } catch (e) {
    console.error('GET /api/meetings/[id]/attendees-emails error:', e);
    return NextResponse.json({ error: '参加者情報の取得に失敗しました' }, { status: 500 });
  }
}
