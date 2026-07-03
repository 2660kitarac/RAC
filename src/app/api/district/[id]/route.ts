import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { districtEvents, users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { isDistrictStaff } from '@/lib/hooks/useAuth';

// PATCH /api/district/[id] - 地区行事更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      title, eventType, date, startTime, endTime,
      venueName, venueAddress, registrationFee, registrationDeadline,
      description, hostClubId, isAwardTarget, isJointMeeting,
    } = body;

    if (!title || !date) {
      return NextResponse.json({ error: '行事名・開催日は必須です' }, { status: 400 });
    }

    // 対象行事の存在確認
    const existing = await db
      .select({ id: districtEvents.id })
      .from(districtEvents)
      .where(and(eq(districtEvents.id, params.id), isNull(districtEvents.deletedAt)))
      .then((r: any[]) => r[0]);

    if (!existing) {
      return NextResponse.json({ error: '行事が見つかりません' }, { status: 404 });
    }

    await db.update(districtEvents)
      .set({
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
        updatedAt: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      })
      .where(eq(districtEvents.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/district/[id] error:', error);
    return NextResponse.json({ error: '地区行事の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/district/[id] - 地区行事削除（論理削除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    await db.update(districtEvents)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(districtEvents.id, params.id), isNull(districtEvents.deletedAt)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/district/[id] error:', error);
    return NextResponse.json({ error: '地区行事の削除に失敗しました' }, { status: 500 });
  }
}
