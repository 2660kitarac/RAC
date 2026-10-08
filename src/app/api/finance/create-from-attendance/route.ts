import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { attendances, meetings } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canManageClub, canMutateClubRecord } from '@/lib/auth/tenant';
import { postAttendanceIncome } from '@/lib/finance/attendance-income';

/**
 * POST /api/finance/create-from-attendance
 * 支払済みの出席登録を会計に収入として計上する。
 * ※ 出席情報の更新 API（/api/attendances/[id]）でも自動計上するため、通常は呼ばなくてよい。
 *   既存画面からの呼び出し用に残している（計上済みなら何もしない）。
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    // 支払済みへの変更（出欠管理画面）と同じ範囲のロールに限る
    if (!canManageClub(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { attendanceId } = await request.json();
    if (!attendanceId || typeof attendanceId !== 'string') {
      return NextResponse.json({ error: 'attendanceId は必須です' }, { status: 400 });
    }

    const [row] = await db
      .select({ clubId: meetings.clubId })
      .from(attendances)
      .innerJoin(meetings, eq(attendances.meetingId, meetings.id))
      .where(and(eq(attendances.id, attendanceId), isNull(attendances.deletedAt)))
      .limit(1);
    if (!row) return NextResponse.json({ success: false, message: '対象なし' });
    // 他クラブの例会の参加費は計上させない
    if (!canMutateClubRecord(session.user, row.clubId)) {
      return NextResponse.json({ error: '他クラブの例会は操作できません' }, { status: 403 });
    }

    const transactionId = await postAttendanceIncome(db, attendanceId, session.user.id);
    if (!transactionId) return NextResponse.json({ success: false, message: '計上済み、または対象外です' });
    return NextResponse.json({ success: true, transactionId });
  } catch (e) {
    console.error('POST /api/finance/create-from-attendance error:', e);
    return NextResponse.json({ error: '会計への計上に失敗しました' }, { status: 500 });
  }
}
