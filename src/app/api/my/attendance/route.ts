/**
 * GET  /api/my/attendance?meetingId=xxx  → 自分のその例会への出席レコード取得
 * POST /api/my/attendance               → 自分の出席登録・更新
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances, meetings, users } from '@/lib/db/schema';
import { eq, and, isNull, gte, asc, count } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    const meetingId = url.searchParams.get('meetingId');

    if (meetingId) {
      // 特定例会への自分の出席レコード
      const result = await db
        .select()
        .from(attendances)
        .where(and(
          eq(attendances.meetingId, meetingId),
          eq(attendances.userId, session.user.id),
          isNull(attendances.deletedAt),
        ))
        .limit(1);
      return NextResponse.json({ attendance: result[0] || null });
    }

    // 今後の例会一覧＋自分の出席状況
    const clubId = session.user.clubId;
    const todayStr = new Date().toISOString().split('T')[0];

    const upcomingMeetings = await db
      .select({
        id: meetings.id,
        title: meetings.title,
        date: meetings.date,
        startTime: meetings.startTime,
        endTime: meetings.endTime,
        venueName: meetings.venueName,
        venueAddress: meetings.venueAddress,
        status: meetings.status,
        registrationDeadline: meetings.registrationDeadline,
        feeRac: meetings.feeRac,
        feeRc: meetings.feeRc,
        feeObog: meetings.feeObog,
        feeGuest: meetings.feeGuest,
        hasAfterParty: (meetings as any).hasAfterParty,
        afterPartyVenue: (meetings as any).afterPartyVenue,
        afterPartyStartTime: (meetings as any).afterPartyStartTime,
        afterPartyFeeRac: (meetings as any).afterPartyFeeRac,
        afterPartyFeeRc: (meetings as any).afterPartyFeeRc,
        afterPartyFeeObog: (meetings as any).afterPartyFeeObog,
        afterPartyFeeGuest: (meetings as any).afterPartyFeeGuest,
        capacity: (meetings as any).capacity,
        afterPartyCapacity: (meetings as any).afterPartyCapacity,
      })
      .from(meetings)
      .where(and(
        clubId ? eq(meetings.clubId, clubId) : isNull(meetings.deletedAt),
        isNull(meetings.deletedAt),
        gte(meetings.date, todayStr),
        eq(meetings.status, 'open'),
      ))
      .orderBy(asc(meetings.date))
      .limit(10);

    // 自分の出席レコード一覧
    const meetingIds = upcomingMeetings.map(m => m.id);
    let myAttendances: any[] = [];
    if (meetingIds.length > 0) {
      myAttendances = await db
        .select()
        .from(attendances)
        .where(and(
          eq(attendances.userId, session.user.id),
          isNull(attendances.deletedAt),
        ));
    }

    // 各例会の現在の登録人数（定員チェック用）
    const countResults: any[] = [];
    for (const m of upcomingMeetings) {
      const [c] = await db
        .select({ val: count() })
        .from(attendances)
        .where(and(
          eq(attendances.meetingId, m.id),
          isNull(attendances.deletedAt),
        ));
      countResults.push({ meetingId: m.id, count: c?.val || 0 });
    }

    const myAttendanceMap = Object.fromEntries(
      myAttendances.map(a => [a.meeting_id || a.meetingId, a])
    );
    const countMap = Object.fromEntries(
      countResults.map(c => [c.meetingId, c.count])
    );

    const result = upcomingMeetings.map(m => ({
      ...m,
      myAttendance: myAttendanceMap[m.id] || null,
      currentCount: countMap[m.id] || 0,
    }));

    return NextResponse.json({ meetings: result });
  } catch (error) {
    console.error('GET /api/my/attendance error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();
    const { meetingId, participationType, note } = body;

    if (!meetingId) return NextResponse.json({ error: 'meetingId は必須です' }, { status: 400 });
    if (!participationType) return NextResponse.json({ error: 'participationType は必須です' }, { status: 400 });

    // 例会情報取得
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, meetingId), isNull(meetings.deletedAt)))
      .limit(1);

    if (!meeting) return NextResponse.json({ error: '例会が見つかりません' }, { status: 404 });

    // 締切チェック
    if (meeting.registrationDeadline) {
      const today = new Date().toISOString().split('T')[0];
      if (today > meeting.registrationDeadline) {
        return NextResponse.json({ error: '登録締切日を過ぎています' }, { status: 400 });
      }
    }

    // ステータスチェック
    if (meeting.status !== 'open') {
      return NextResponse.json({ error: 'この例会は現在登録を受け付けていません' }, { status: 400 });
    }

    // 自分のユーザー情報取得
    const [userRecord] = await db
      .select({ memberType: users.memberType, clubId: users.clubId, name: users.name })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const memberType = userRecord?.memberType || 'RAC';
    const clubId = userRecord?.clubId || null;

    // 参加費計算
    let feeAmount = 0;
    let afterPartyFeeAmount = 0;
    if (participationType !== 'absent' && participationType !== 'waitlist') {
      if (memberType === 'RAC') feeAmount = meeting.feeRac || 0;
      else if (memberType === 'RC') feeAmount = meeting.feeRc || 0;
      else if (memberType === 'OB_OG') feeAmount = meeting.feeObog || 0;
      else feeAmount = meeting.feeGuest || 0;

      if (participationType === 'meeting_and_party') {
        const m = meeting as any;
        if (memberType === 'RAC') afterPartyFeeAmount = m.afterPartyFeeRac || 0;
        else if (memberType === 'RC') afterPartyFeeAmount = m.afterPartyFeeRc || 0;
        else if (memberType === 'OB_OG') afterPartyFeeAmount = m.afterPartyFeeObog || 0;
        else afterPartyFeeAmount = m.afterPartyFeeGuest || 0;
      }
    }

    // 定員チェック（欠席・キャンセル待ち以外）
    if (participationType !== 'absent' && participationType !== 'waitlist') {
      const capacity = (meeting as any).capacity;
      if (capacity) {
        const [currentCount] = await db
          .select({ val: count() })
          .from(attendances)
          .where(and(
            eq(attendances.meetingId, meetingId),
            isNull(attendances.deletedAt),
          ));
        if ((currentCount?.val || 0) >= capacity) {
          // 定員超過 → キャンセル待ちとして登録
          return NextResponse.json({
            error: '定員に達しています',
            canWaitlist: true,
          }, { status: 409 });
        }
      }
    }

    // 既存レコード確認（更新 or 新規）
    const existing = await db
      .select()
      .from(attendances)
      .where(and(
        eq(attendances.meetingId, meetingId),
        eq(attendances.userId, session.user.id),
        isNull(attendances.deletedAt),
      ))
      .limit(1);

    if (existing[0]) {
      // 更新
      await db.update(attendances).set({
        participationType: participationType as any,
        afterPartyFeeAmount: afterPartyFeeAmount as any,
        feeAmount,
        note: note || null,
        attendanceStatus: participationType === 'absent' ? 'absent' : 'undecided',
        updatedAt: new Date().toISOString(),
      } as any).where(eq(attendances.id, existing[0].id));

      return NextResponse.json({ id: existing[0].id, updated: true });
    } else {
      // 新規作成
      const id = randomUUID();
      await db.insert(attendances).values({
        id,
        meetingId,
        userId: session.user.id,
        clubId,
        memberType,
        participationType: participationType as any,
        attendanceStatus: participationType === 'absent' ? 'absent' : 'undecided',
        feeAmount,
        afterPartyFeeAmount: afterPartyFeeAmount as any,
        paymentStatus: participationType === 'absent' ? 'exempt' : 'unpaid',
        note: note || null,
        registrationType: 'member',
      } as any);

      return NextResponse.json({ id, created: true }, { status: 201 });
    }
  } catch (error) {
    console.error('POST /api/my/attendance error:', error);
    return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 });
  }
}
