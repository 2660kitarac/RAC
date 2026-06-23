import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { donations, users } from '@/lib/db/schema';
import { eq, and, isNull, gte, lte } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// GET /api/finance/donations?clubId=xxx&meetingId=xxx&from=2024-01-01
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const url = new URL(request.url);
    const clubId = url.searchParams.get('clubId') || session.user.clubId;
    const meetingId = url.searchParams.get('meetingId');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const conditions = and(
      clubId ? eq(donations.clubId, clubId) : undefined,
      isNull(donations.deletedAt),
      meetingId ? eq(donations.meetingId, meetingId) : undefined,
      from ? gte(donations.receivedAt, from) : undefined,
      to ? lte(donations.receivedAt, to) : undefined,
    );

    const results = await db
      .select({
        id: donations.id,
        clubId: donations.clubId,
        meetingId: donations.meetingId,
        donorName: donations.donorName,
        donorUserId: donations.donorUserId,
        donorType: donations.donorType,
        amount: donations.amount,
        message: donations.message,
        paymentMethod: donations.paymentMethod,
        receivedAt: donations.receivedAt,
        createdAt: donations.createdAt,
        updatedAt: donations.updatedAt,
        donorUserName: users.name,
      })
      .from(donations)
      .leftJoin(users, eq(donations.donorUserId, users.id))
      .where(conditions)
      .orderBy(donations.receivedAt);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/finance/donations error:', error);
    return NextResponse.json({ error: '寄付一覧の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/finance/donations - 寄付登録
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const body = await request.json();
    const {
      clubId, meetingId, donorName, donorUserId, donorType,
      amount, message, paymentMethod, receivedAt,
    } = body;

    if (!donorName || !receivedAt) {
      return NextResponse.json({ error: 'donorName, receivedAt は必須です' }, { status: 400 });
    }

    const resolvedClubId = clubId || session.user.clubId;
    if (!resolvedClubId) return NextResponse.json({ error: 'clubId は必須です' }, { status: 400 });

    const id = randomUUID();
    await db.insert(donations).values({
      id,
      clubId: resolvedClubId,
      meetingId: meetingId || null,
      donorName,
      donorUserId: donorUserId || null,
      donorType: donorType || 'RAC',
      amount: amount ?? 0,
      message: message || null,
      paymentMethod: paymentMethod || null,
      receivedAt,
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/finance/donations error:', error);
    return NextResponse.json({ error: '寄付の登録に失敗しました' }, { status: 500 });
  }
}
