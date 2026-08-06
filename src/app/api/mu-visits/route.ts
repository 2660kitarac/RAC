import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { muVisits, users, transactions, clubs } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { resolveClubScope, isDistrictScope } from '@/lib/auth/tenant';

// GET /api/mu-visits?clubId=xxx&userId=xxx
// クラブアカウント → 自クラブの全会員の訪問一覧（clubIdクエリは無視され自クラブに強制）
// 個人会員       → 自分の訪問一覧のみ
// 地区スタッフ   → clubId指定で任意クラブ／未指定で全クラブ横断
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    const sessionUser = session.user as any;

    // ---- テナント検証: クエリの clubId は信頼せず、自クラブへ強制する ----
    const requestedClubId = url.searchParams.get('clubId');
    const scope = resolveClubScope(sessionUser, requestedClubId);

    if (scope.forbidden) {
      return NextResponse.json(
        { error: '他クラブのMU訪問履歴は参照できません' },
        { status: 403 },
      );
    }

    // ---- userId も同様に検証: 自クラブ以外の会員は指定できない ----
    const requestedUserId = url.searchParams.get('userId');
    let userId: string | null = null;

    if (requestedUserId) {
      if (isDistrictScope(sessionUser.role)) {
        // 地区スタッフは任意の会員を参照可能
        userId = requestedUserId;
      } else if (requestedUserId === sessionUser.id) {
        // 自分自身は常に許可
        userId = requestedUserId;
      } else {
        // 指定された会員が自クラブ所属かを確認
        const [target] = await db
          .select({ clubId: users.clubId })
          .from(users)
          .where(and(eq(users.id, requestedUserId), isNull(users.deletedAt)))
          .limit(1);

        if (!target || !scope.clubId || target.clubId !== scope.clubId) {
          return NextResponse.json(
            { error: '他クラブ会員のMU訪問履歴は参照できません' },
            { status: 403 },
          );
        }
        userId = requestedUserId;
      }
    }

    // クラブに属さないアカウント（未所属の個人会員など）は
    // クラブ横断参照を許さず、自分自身の履歴のみに限定する
    if (!scope.clubId && !scope.crossClub && !userId) {
      userId = sessionUser.id ?? null;
      if (!userId) {
        return NextResponse.json({ error: '参照権限がありません' }, { status: 403 });
      }
    }

    const conditions = and(
      scope.clubId ? eq(muVisits.clubId, scope.clubId) : undefined,
      userId ? eq(muVisits.userId, userId) : undefined,
      isNull(muVisits.deletedAt),
    );

    const results = await db
      .select({
        id: muVisits.id,
        clubId: muVisits.clubId,
        userId: muVisits.userId,
        visitedClubName: muVisits.visitedClubName,
        visitDate: muVisits.visitDate,
        feeAmount: muVisits.feeAmount,
        note: muVisits.note,
        settlementStatus: muVisits.settlementStatus,
        settledAt: muVisits.settledAt,
        settledBy: muVisits.settledBy,
        transactionId: muVisits.transactionId,
        createdAt: muVisits.createdAt,
        updatedAt: muVisits.updatedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(muVisits)
      .leftJoin(users, eq(muVisits.userId, users.id))
      .where(conditions)
      .orderBy(desc(muVisits.visitDate));

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/mu-visits error:', error);
    return NextResponse.json({ error: 'MU訪問履歴の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/mu-visits - MU訪問報告を登録
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();

    const {
      visitedClubName,
      visitDate,
      feeAmount,
      note,
    } = body;

    if (!visitedClubName) {
      return NextResponse.json({ error: '訪問先クラブ名は必須です' }, { status: 400 });
    }
    if (!visitDate) {
      return NextResponse.json({ error: '訪問日は必須です' }, { status: 400 });
    }

    const clubId = session.user.clubId;
    const userId = session.user.id;

    if (!clubId) {
      return NextResponse.json({ error: 'クラブ情報が取得できません' }, { status: 400 });
    }

    // クラブの mu_fee_personal_burden フラグを確認
    const [club] = await db
      .select({ muFeePersonalBurden: clubs.muFeePersonalBurden })
      .from(clubs)
      .where(eq(clubs.id, clubId))
      .limit(1);

    const isPersonalBurden = club?.muFeePersonalBurden ?? false;

    // 個人負担クラブは settlementStatus を personal に設定（会計不計上）
    const settlementStatus = isPersonalBurden ? 'personal' : 'pending';

    const id = randomUUID();
    const now = new Date().toISOString();

    let transactionId: string | null = null;

    // クラブ負担の場合は会計に自動計上（立替）
    if (!isPersonalBurden && feeAmount > 0) {
      transactionId = randomUUID();
      await db.insert(transactions).values({
        id: transactionId,
        clubId,
        transactionType: 'expense',
        category: 'mu_fee',
        amount: feeAmount,
        description: `MU費立替: ${visitedClubName}（${visitDate}）`,
        transactionDate: visitDate,
        paymentMethod: 'cash',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.insert(muVisits).values({
      id,
      clubId,
      userId,
      visitedClubName,
      visitDate,
      feeAmount: feeAmount ?? 0,
      note: note || null,
      settlementStatus,
      transactionId,
      createdAt: now,
      updatedAt: now,
    } as any);

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/mu-visits error:', error);
    return NextResponse.json({ error: 'MU訪問報告の登録に失敗しました' }, { status: 500 });
  }
}
