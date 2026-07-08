import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, users } from '@/lib/db/schema';
import { eq, and, isNull, desc, gte, lte } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// GET /api/meetings - 例会一覧
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    const clubId = url.searchParams.get('clubId') || session.user.clubId;
    const status = url.searchParams.get('status');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const conditions = and(
      clubId ? eq(meetings.clubId, clubId) : undefined,
      isNull(meetings.deletedAt),
      status ? eq(meetings.status, status) : undefined,
      from ? gte(meetings.date, from) : undefined,
      to ? lte(meetings.date, to) : undefined,
    );

    const results = await db.select().from(meetings).where(conditions).orderBy(desc(meetings.date));
    return NextResponse.json({ meetings: results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/meetings - 例会作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();
    const {
      title, meetingNumber, theme, date, startTime, endTime,
      venueName, venueAddress, committee, managerUserId,
      description, programDetail, registrationDeadline,
      feeRac = 0, feeRc = 0, feeObog = 0, feeGuest = 0, mealFee = 0,
      muRegistrationSlug, muRegistrationUrl, status = 'draft', isDistrictEvent = false,
      // 定員
      capacity = null,
      // 懇親会
      hasAfterParty = false, afterPartyVenue = null, afterPartyStartTime = null,
      afterPartyFeeType = 'fixed',
      afterPartyFeeRac = 0, afterPartyFeeRc = 0, afterPartyFeeObog = 0, afterPartyFeeGuest = 0,
      afterPartyAllowPartyOnly = false,
      afterPartyCapacity = null,
    } = body;

    if (!title || !date) return NextResponse.json({ error: 'タイトルと日付は必須です' }, { status: 400 });

    const clubId = body.clubId || session.user.clubId;
    const id = randomUUID();

    await db.insert(meetings).values({
      id, clubId, title, meetingNumber, theme, date, startTime, endTime,
      venueName, venueAddress, committee, managerUserId,
      description, programDetail, registrationDeadline,
      feeRac, feeRc, feeObog, feeGuest, mealFee,
      muRegistrationSlug: muRegistrationSlug || null,
      muRegistrationUrl: muRegistrationUrl || null,
      status, isDistrictEvent,
      createdBy: session.user.id,
      // 定員
      capacity,
      // 懇親会
      hasAfterParty, afterPartyVenue, afterPartyStartTime,
      afterPartyFeeType, afterPartyFeeRac, afterPartyFeeRc, afterPartyFeeObog, afterPartyFeeGuest,
      afterPartyAllowPartyOnly, afterPartyCapacity,
    } as any);

    return NextResponse.json({ meeting: { id, title, date, status } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
