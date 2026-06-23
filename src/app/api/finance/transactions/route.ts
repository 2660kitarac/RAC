import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { transactions } from '@/lib/db/schema';
import { eq, and, isNull, gte, lte } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// GET /api/finance/transactions?clubId=xxx&type=income&from=2024-01-01&to=2024-12-31
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const url = new URL(request.url);
    const clubId = url.searchParams.get('clubId') || session.user.clubId;
    const transactionType = url.searchParams.get('type');
    const category = url.searchParams.get('category');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const meetingId = url.searchParams.get('meetingId');

    const conditions = and(
      clubId ? eq(transactions.clubId, clubId) : undefined,
      isNull(transactions.deletedAt),
      transactionType ? eq(transactions.transactionType, transactionType) : undefined,
      category ? eq(transactions.category, category) : undefined,
      meetingId ? eq(transactions.meetingId, meetingId) : undefined,
      from ? gte(transactions.transactionDate, from) : undefined,
      to ? lte(transactions.transactionDate, to) : undefined,
    );

    const results = await db.select().from(transactions).where(conditions)
      .orderBy(transactions.transactionDate);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/finance/transactions error:', error);
    return NextResponse.json({ error: '取引一覧の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/finance/transactions - 取引追加
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const body = await request.json();
    const {
      clubId, districtId, meetingId, transactionType, category, amount,
      payerName, payeeName, paymentMethod, transactionDate, description, receiptId,
    } = body;

    if (!transactionType || !category || !transactionDate) {
      return NextResponse.json({ error: 'transactionType, category, transactionDate は必須です' }, { status: 400 });
    }

    const resolvedClubId = clubId || session.user.clubId;
    if (!resolvedClubId) return NextResponse.json({ error: 'clubId は必須です' }, { status: 400 });

    const id = randomUUID();
    await db.insert(transactions).values({
      id,
      clubId: resolvedClubId,
      districtId: districtId || null,
      meetingId: meetingId || null,
      transactionType,
      category,
      amount: amount ?? 0,
      payerName: payerName || null,
      payeeName: payeeName || null,
      paymentMethod: paymentMethod || null,
      transactionDate,
      description: description || null,
      receiptId: receiptId || null,
      createdBy: session.user.id,
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/finance/transactions error:', error);
    return NextResponse.json({ error: '取引の追加に失敗しました' }, { status: 500 });
  }
}
