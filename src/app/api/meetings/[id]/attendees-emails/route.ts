import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances, users } from '@/lib/db/schema';
import { eq, isNull, and, isNotNull } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id: meetingId } = await params;
    const db = await getDbFromContext();

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
        .filter(r => r.email)
        .map(r => ({ id: r.id, name: r.name || '(名前なし)', email: r.email! })),
      ...internal
        .filter(r => r.email)
        .map(r => ({ id: r.id, name: r.name || '(名前なし)', email: r.email! })),
    ];

    return NextResponse.json({ attendees });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
