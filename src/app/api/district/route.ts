import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { districtEvents, users } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { isDistrictStaff } from '@/lib/hooks/useAuth';
import { nanoid } from 'nanoid';

// GET /api/district - 地区行事一覧
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const districtId = searchParams.get('districtId');

    const db = await getDbFromContext();

    let query = db.select().from(districtEvents).where(isNull(districtEvents.deletedAt));

    const events = districtId
      ? await db.select().from(districtEvents)
          .where(and(eq(districtEvents.districtId, districtId), isNull(districtEvents.deletedAt)))
          .orderBy(desc(districtEvents.date))
      : await db.select().from(districtEvents)
          .where(isNull(districtEvents.deletedAt))
          .orderBy(desc(districtEvents.date));

    return NextResponse.json({ events });
  } catch (error) {
    console.error('GET /api/district error:', error);
    return NextResponse.json({ error: '地区行事の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/district - 地区行事作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();

    // 権限チェック
    const profile = await db
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, session.user.id!), isNull(users.deletedAt)))
      .then((r: any[]) => r[0]);

    if (!isDistrictStaff((profile?.role || 'member') as any)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const body = await request.json();
    const {
      districtId, title, eventType, date, startTime, endTime,
      venueName, venueAddress, registrationFee, registrationDeadline,
      description, hostClubId, isAwardTarget, isJointMeeting,
    } = body;

    if (!districtId || !title || !date) {
      return NextResponse.json({ error: '必須項目（地区ID・行事名・開催日）が不足しています' }, { status: 400 });
    }

    const id = nanoid();
    await db.insert(districtEvents).values({
      id,
      districtId,
      title,
      eventType: eventType || 'その他',
      date,
      startTime: startTime || null,
      endTime: endTime || null,
      venueName: venueName || null,
      venueAddress: venueAddress || null,
      registrationFee: registrationFee || 0,
      registrationDeadline: registrationDeadline || null,
      description: description || null,
      hostClubId: hostClubId || null,
      isAwardTarget: isAwardTarget ?? false,
      isJointMeeting: isJointMeeting ?? false,
      createdBy: session.user.id,
    });

    return NextResponse.json({ id, success: true });
  } catch (error) {
    console.error('POST /api/district error:', error);
    return NextResponse.json({ error: '地区行事の作成に失敗しました' }, { status: 500 });
  }
}
