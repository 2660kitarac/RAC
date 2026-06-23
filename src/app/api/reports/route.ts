import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetingReports } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// GET /api/reports?meetingId=xxx&clubId=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    const meetingId = url.searchParams.get('meetingId');
    const clubId = url.searchParams.get('clubId') || session.user.clubId;

    const conditions = and(
      isNull(meetingReports.deletedAt),
      clubId ? eq(meetingReports.clubId, clubId) : undefined,
      meetingId ? eq(meetingReports.meetingId, meetingId) : undefined,
    );

    const results = await db.select().from(meetingReports).where(conditions)
      .orderBy(meetingReports.createdAt);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/reports error:', error);
    return NextResponse.json({ error: '報告書一覧の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/reports - 報告書作成/更新
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();
    const {
      clubId, meetingId, title, summary, reportBody,
      participantsCount, racCount, rcCount, obogCount, guestCount,
      incomeTotal, expenseTotal, balance,
    } = body;

    if (!meetingId || !title) {
      return NextResponse.json({ error: 'meetingId と title は必須です' }, { status: 400 });
    }

    const resolvedClubId = clubId || session.user.clubId;
    if (!resolvedClubId) return NextResponse.json({ error: 'clubId は必須です' }, { status: 400 });

    // 既存の報告書があれば更新
    const existing = await db.select({ id: meetingReports.id }).from(meetingReports)
      .where(and(eq(meetingReports.meetingId, meetingId), isNull(meetingReports.deletedAt)))
      .limit(1);

    if (existing.length) {
      await db.update(meetingReports).set({
        title, summary: summary || null, reportBody: reportBody || null,
        participantsCount: participantsCount ?? 0,
        racCount: racCount ?? 0, rcCount: rcCount ?? 0,
        obogCount: obogCount ?? 0, guestCount: guestCount ?? 0,
        incomeTotal: incomeTotal ?? 0, expenseTotal: expenseTotal ?? 0,
        balance: balance ?? (incomeTotal ?? 0) - (expenseTotal ?? 0),
        updatedAt: new Date().toISOString(),
      }).where(eq(meetingReports.id, existing[0].id));

      return NextResponse.json({ id: existing[0].id, success: true, updated: true });
    }

    const id = randomUUID();
    await db.insert(meetingReports).values({
      id,
      clubId: resolvedClubId,
      meetingId,
      title,
      summary: summary || null,
      reportBody: reportBody || null,
      participantsCount: participantsCount ?? 0,
      racCount: racCount ?? 0,
      rcCount: rcCount ?? 0,
      obogCount: obogCount ?? 0,
      guestCount: guestCount ?? 0,
      incomeTotal: incomeTotal ?? 0,
      expenseTotal: expenseTotal ?? 0,
      balance: balance ?? (incomeTotal ?? 0) - (expenseTotal ?? 0),
      createdBy: session.user.id,
    });

    return NextResponse.json({ id, success: true, updated: false }, { status: 201 });
  } catch (error) {
    console.error('POST /api/reports error:', error);
    return NextResponse.json({ error: '報告書の保存に失敗しました' }, { status: 500 });
  }
}
