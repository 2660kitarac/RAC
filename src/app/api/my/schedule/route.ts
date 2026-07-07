/**
 * GET /api/my/schedule?year=2025
 * 個人会員向け：年間スケジュール＋自分の出席記録を返す
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, attendances, districtEvents, users, clubs } from '@/lib/db/schema';
import { eq, and, isNull, gte, lte, asc, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    const now = new Date();
    // 7月始まりの年度対応: 7月以降なら currentYear、以前なら currentYear-1
    const fiscalYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const yearParam = url.searchParams.get('year');
    const targetYear = yearParam ? parseInt(yearParam) : fiscalYear;

    // 年度期間: 7/1 〜 翌年6/30
    const startDate = `${targetYear}-07-01`;
    const endDate   = `${targetYear + 1}-06-30`;

    // ユーザーのclubId・districtId取得
    const [userRecord] = await db
      .select({ clubId: users.clubId, districtId: users.districtId, memberType: users.memberType })
      .from(users)
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
      .limit(1);

    const clubId     = userRecord?.clubId ?? (session.user as any).clubId ?? null;
    const districtId = userRecord?.districtId ?? null;
    const memberType = userRecord?.memberType ?? 'RAC';

    // クラブ名取得
    let clubName = '';
    if (clubId) {
      const [c] = await db.select({ name: clubs.name, shortName: clubs.shortName })
        .from(clubs).where(eq(clubs.id, clubId)).limit(1);
      clubName = c?.shortName || c?.name || '';
    }

    // 例会一覧取得（muRegistrationUrl含む）
    const clubMeetings = clubId
      ? await db.select({
          id: meetings.id,
          title: meetings.title,
          date: meetings.date,
          startTime: meetings.startTime,
          endTime: meetings.endTime,
          venueName: meetings.venueName,
          venueAddress: meetings.venueAddress,
          status: meetings.status,
          registrationDeadline: meetings.registrationDeadline,
          muRegistrationUrl: meetings.muRegistrationUrl,
          muRegistrationSlug: meetings.muRegistrationSlug,
          feeRac: meetings.feeRac,
          feeRc: meetings.feeRc,
          feeObog: meetings.feeObog,
          feeGuest: meetings.feeGuest,
          hasAfterParty: meetings.hasAfterParty,
          afterPartyVenue: meetings.afterPartyVenue,
          afterPartyStartTime: meetings.afterPartyStartTime,
          afterPartyFeeRac: meetings.afterPartyFeeRac,
          afterPartyFeeRc: meetings.afterPartyFeeRc,
          afterPartyFeeObog: meetings.afterPartyFeeObog,
          afterPartyFeeGuest: meetings.afterPartyFeeGuest,
          capacity: meetings.capacity,
        })
          .from(meetings)
          .where(and(
            eq(meetings.clubId, clubId),
            isNull(meetings.deletedAt),
            gte(meetings.date, startDate),
            lte(meetings.date, endDate),
          ))
          .orderBy(asc(meetings.date))
      : [];

    // 自分の出席記録を一括取得
    const meetingIds = clubMeetings.map(m => m.id);
    let myAttendances: any[] = [];
    if (meetingIds.length > 0) {
      myAttendances = await db
        .select({
          id: attendances.id,
          meetingId: attendances.meetingId,
          participationType: attendances.participationType,
          attendanceStatus: attendances.attendanceStatus,
          note: attendances.note,
        })
        .from(attendances)
        .where(and(
          eq(attendances.userId, session.user.id),
          isNull(attendances.deletedAt),
          inArray(attendances.meetingId, meetingIds),
        ));
    }
    const attendanceMap = Object.fromEntries(
      myAttendances.map(a => [a.meetingId, a])
    );

    // 地区行事取得（districtIdがある場合）
    let districtEventsList: any[] = [];
    if (districtId) {
      districtEventsList = await db
        .select({
          id: districtEvents.id,
          title: districtEvents.title,
          date: districtEvents.date,
          startTime: districtEvents.startTime,
          venueName: districtEvents.venueName,
          eventType: districtEvents.eventType,
          isAwardTarget: districtEvents.isAwardTarget,
        })
        .from(districtEvents)
        .where(and(
          eq(districtEvents.districtId, districtId),
          isNull(districtEvents.deletedAt),
          gte(districtEvents.date, startDate),
          lte(districtEvents.date, endDate),
        ))
        .orderBy(asc(districtEvents.date));
    }

    // 例会に出席情報を付加
    const enrichedMeetings = clubMeetings.map(m => ({
      ...m,
      kind: 'meeting' as const,
      myAttendance: attendanceMap[m.id] ?? null,
    }));

    // 地区行事をフォーマット
    const enrichedEvents = districtEventsList.map(e => ({
      ...e,
      kind: 'district_event' as const,
      myAttendance: null,
    }));

    // 参加統計
    const today = now.toISOString().split('T')[0];
    const pastMeetings = enrichedMeetings.filter(m => m.date < today);
    const attendedCount = pastMeetings.filter(
      m => m.myAttendance &&
        m.myAttendance.participationType !== 'absent' &&
        m.myAttendance.participationType !== 'waitlist'
    ).length;
    const totalPast = pastMeetings.length;

    return NextResponse.json({
      meetings: enrichedMeetings,
      districtEvents: enrichedEvents,
      stats: {
        year: targetYear,
        totalMeetings: clubMeetings.length,
        pastMeetings: totalPast,
        attendedCount,
        attendanceRate: totalPast > 0 ? Math.round((attendedCount / totalPast) * 100) : null,
      },
      meta: { clubName, memberType, fiscalYear },
    });
  } catch (error) {
    console.error('GET /api/my/schedule error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}
