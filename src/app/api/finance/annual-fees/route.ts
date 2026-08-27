import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { annualFees, users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { resolveClubScope } from '@/lib/auth/tenant';
import { randomUUID } from 'crypto';

// GET /api/finance/annual-fees?clubId=xxx&fiscalYear=2024&paymentStatus=unpaid
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
    const fiscalYear = url.searchParams.get('fiscalYear');
    const paymentStatus = url.searchParams.get('paymentStatus');

    const conditions = and(
      clubId ? eq(annualFees.clubId, clubId) : undefined,
      isNull(annualFees.deletedAt),
      fiscalYear ? eq(annualFees.fiscalYear, parseInt(fiscalYear)) : undefined,
      paymentStatus ? eq(annualFees.paymentStatus, paymentStatus) : undefined,
    );

    const results = await db
      .select({
        id: annualFees.id,
        clubId: annualFees.clubId,
        userId: annualFees.userId,
        fiscalYear: annualFees.fiscalYear,
        amount: annualFees.amount,
        paymentStatus: annualFees.paymentStatus,
        paymentMethod: annualFees.paymentMethod,
        paidAt: annualFees.paidAt,
        note: annualFees.note,
        createdAt: annualFees.createdAt,
        updatedAt: annualFees.updatedAt,
        userName: users.name,
        userEmail: users.email,
        userMemberType: users.memberType,
      })
      .from(annualFees)
      .leftJoin(users, eq(annualFees.userId, users.id))
      .where(conditions)
      .orderBy(annualFees.fiscalYear, users.name);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/finance/annual-fees error:', error);
    return NextResponse.json({ error: '年会費一覧の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/finance/annual-fees - 年会費レコード作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();
    const { clubId, userId, fiscalYear, amount, paymentStatus, paymentMethod, paidAt, note } = body;

    if (!userId || !fiscalYear) {
      return NextResponse.json({ error: 'userId, fiscalYear は必須です' }, { status: 400 });
    }

    // ボディの clubId は信頼しない（他クラブ名義での作成を防ぐ）
    const writeScope = resolveClubScope(session.user, clubId);
    if (writeScope.forbidden) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    const resolvedClubId = writeScope.clubId;
    if (!resolvedClubId) return NextResponse.json({ error: 'clubId は必須です' }, { status: 400 });

    const id = randomUUID();
    await db.insert(annualFees).values({
      id,
      clubId: resolvedClubId,
      userId,
      fiscalYear: parseInt(String(fiscalYear)),
      amount: amount ?? 0,
      paymentStatus: paymentStatus || 'unpaid',
      paymentMethod: paymentMethod || null,
      paidAt: paidAt || null,
      note: note || null,
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/finance/annual-fees error:', error);
    return NextResponse.json({ error: '年会費レコードの作成に失敗しました' }, { status: 500 });
  }
}
