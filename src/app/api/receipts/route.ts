import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, meetings } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { resolveClubScope, canManageFinance } from '@/lib/auth/tenant';

// GET /api/receipts?clubId=xxx&meetingId=xxx&status=issued
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    // クエリの clubId は信頼しない（IDOR 対策）
    const scope = resolveClubScope(session.user, url.searchParams.get('clubId'));
    if (scope.forbidden) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    const clubId = scope.clubId;
    const meetingId = url.searchParams.get('meetingId');
    const status = url.searchParams.get('status');

    const conditions = and(
      clubId ? eq(receipts.clubId, clubId) : undefined,
      isNull(receipts.deletedAt),
      meetingId ? eq(receipts.meetingId, meetingId) : undefined,
      status ? eq(receipts.status, status) : undefined,
    );

    const results = await db
      .select({
        id: receipts.id,
        clubId: receipts.clubId,
        meetingId: receipts.meetingId,
        attendanceId: receipts.attendanceId,
        transactionId: receipts.transactionId,
        receiptNumber: receipts.receiptNumber,
        receiptName: receipts.receiptName,
        receiptClubName: receipts.receiptClubName,
        amount: receipts.amount,
        description: receipts.description,
        issuedDate: receipts.issuedDate,
        pdfUrl: receipts.pdfUrl,
        status: receipts.status,
        issuedBy: receipts.issuedBy,
        cancelReason: receipts.cancelReason,
        createdAt: receipts.createdAt,
        updatedAt: receipts.updatedAt,
        meetingTitle: meetings.title,
        meetingDate: meetings.date,
      })
      .from(receipts)
      .leftJoin(meetings, eq(receipts.meetingId, meetings.id))
      .where(conditions)
      .orderBy(receipts.issuedDate);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/receipts error:', error);
    return NextResponse.json({ error: '領収書一覧の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/receipts - 領収書発行
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();
    const {
      clubId, meetingId, attendanceId, transactionId, receiptNumber,
      receiptName, receiptClubName, amount, description, issuedDate, pdfUrl,
    } = body;

    if (!canManageFinance(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    if (!receiptName || !amount || !issuedDate) {
      return NextResponse.json({ error: 'receiptName, amount, issuedDate は必須です' }, { status: 400 });
    }

    // ボディの clubId は信頼しない（他クラブ名義での発行を防ぐ）
    const postScope = resolveClubScope(session.user, clubId);
    if (postScope.forbidden) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    const resolvedClubId = postScope.clubId;
    if (!resolvedClubId) return NextResponse.json({ error: 'clubId は必須です' }, { status: 400 });

    // receiptNumberが未指定の場合、自動採番（YYYYMMDD-XXXX形式）
    const autoReceiptNumber = receiptNumber || `${issuedDate.replace(/-/g, '')}-${randomUUID().substring(0, 4).toUpperCase()}`;

    const id = randomUUID();
    await db.insert(receipts).values({
      id,
      clubId: resolvedClubId,
      meetingId: meetingId || null,
      attendanceId: attendanceId || null,
      transactionId: transactionId || null,
      receiptNumber: autoReceiptNumber,
      receiptName,
      receiptClubName: receiptClubName || null,
      amount,
      description: description || '例会参加費',
      issuedDate,
      pdfUrl: pdfUrl || null,
      status: 'issued',
      issuedBy: session.user.id,
    });

    return NextResponse.json({ id, receiptNumber: autoReceiptNumber, success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/receipts error:', error);
    return NextResponse.json({ error: '領収書の発行に失敗しました' }, { status: 500 });
  }
}
