import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances, users, meetings } from '@/lib/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { resolveClubScope } from '@/lib/auth/tenant';

// GET /api/attendances?meetingId=xxx&clubId=xxx
// クラブアカウント → 自クラブの例会の出席情報のみ（clubIdクエリは無視され自クラブに強制）
// 地区スタッフ     → clubId指定で任意クラブ／未指定で全クラブ横断
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    const meetingId = url.searchParams.get('meetingId');
    const sessionUser = session.user as any;

    // ---- テナント検証: クエリの clubId は信頼せず、自クラブへ強制する ----
    const scope = resolveClubScope(sessionUser, url.searchParams.get('clubId'));
    if (scope.forbidden) {
      return NextResponse.json(
        { error: '他クラブの出席情報は参照できません' },
        { status: 403 },
      );
    }

    // クラブ横断参照でない場合は、自クラブの例会に限定する
    let scopeCondition: any = undefined;
    if (!scope.crossClub) {
      if (!scope.clubId) {
        return NextResponse.json({ error: '参照権限がありません' }, { status: 403 });
      }

      if (meetingId) {
        // 指定された例会が自クラブのものかを検証
        const [meeting] = await db
          .select({ clubId: meetings.clubId })
          .from(meetings)
          .where(and(eq(meetings.id, meetingId), isNull(meetings.deletedAt)))
          .limit(1);

        if (!meeting || meeting.clubId !== scope.clubId) {
          return NextResponse.json(
            { error: '他クラブの例会の出席情報は参照できません' },
            { status: 403 },
          );
        }
      } else {
        // 例会未指定の場合は自クラブの例会IDに絞り込む
        const clubMeetings = await db
          .select({ id: meetings.id })
          .from(meetings)
          .where(and(eq(meetings.clubId, scope.clubId), isNull(meetings.deletedAt)));

        const meetingIds = clubMeetings.map((m: any) => m.id);
        // 例会が0件なら該当なし（全件フォールバックしない）
        if (meetingIds.length === 0) return NextResponse.json([]);
        scopeCondition = inArray(attendances.meetingId, meetingIds);
      }
    }

    const conditions = and(
      meetingId ? eq(attendances.meetingId, meetingId) : undefined,
      scopeCondition,
      isNull(attendances.deletedAt),
    );

    const results = await db
      .select({
        id: attendances.id,
        meetingId: attendances.meetingId,
        userId: attendances.userId,
        externalName: attendances.externalName,
        externalEmail: attendances.externalEmail,
        externalPhone: attendances.externalPhone,
        clubId: attendances.clubId,
        clubName: attendances.clubName,
        memberType: attendances.memberType,
        attendanceStatus: attendances.attendanceStatus,
        registrationType: attendances.registrationType,
        mealRequired: attendances.mealRequired,
        feeAmount: attendances.feeAmount,
        paymentStatus: attendances.paymentStatus,
        paymentMethod: attendances.paymentMethod,
        paidAt: attendances.paidAt,
        receiptRequired: attendances.receiptRequired,
        receiptNameType: attendances.receiptNameType,
        receiptName: attendances.receiptName,
        note: attendances.note,
        registeredAt: attendances.registeredAt,
        createdAt: attendances.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(attendances)
      .leftJoin(users, eq(attendances.userId, users.id))
      .where(conditions);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/attendances error:', error);
    return NextResponse.json({ error: '出席情報の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/attendances - 出席登録
// MU登録（外部フォーム）からの呼び出しは未認証でも許可
export async function POST(request: NextRequest) {
  try {
    // registrationType が 'mu' の場合は未認証でも許可（外部参加者登録）
    const body = await request.json();
    const isMuRegistration = body.registrationType === 'mu';

    if (!isMuRegistration) {
      const session = await auth();
      if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const db = await getDbFromContext();
    const {
      meetingId, userId, externalName, externalEmail, externalPhone,
      clubId, clubName, memberType, attendanceStatus, registrationType,
      mealRequired, feeAmount, paymentStatus, paymentMethod,
      receiptRequired, receiptNameType, receiptName, note,
      participationType, afterPartyFeeAmount,
    } = body;

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId は必須です' }, { status: 400 });
    }

    // MU登録は外部名前+メールが必須
    if (isMuRegistration && !externalName && !userId) {
      return NextResponse.json({ error: 'お名前は必須です' }, { status: 400 });
    }

    const id = randomUUID();
    await db.insert(attendances).values({
      id,
      meetingId,
      userId: userId || null,
      externalName: externalName || null,
      externalEmail: externalEmail || null,
      externalPhone: externalPhone || null,
      clubId: clubId || null,
      clubName: clubName || null,
      memberType: memberType || 'RAC',
      attendanceStatus: attendanceStatus || 'undecided',
      registrationType: registrationType || 'member',
      mealRequired: mealRequired ?? false,
      feeAmount: feeAmount ?? 0,
      paymentStatus: paymentStatus || 'unpaid',
      paymentMethod: paymentMethod || null,
      receiptRequired: receiptRequired ?? false,
      receiptNameType: receiptNameType || null,
      receiptName: receiptName || null,
      note: note || null,
      participationType: participationType || 'meeting_only',
      afterPartyFeeAmount: afterPartyFeeAmount ?? 0,
    } as any);

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/attendances error:', error);
    return NextResponse.json({ error: '出席登録に失敗しました' }, { status: 500 });
  }
}
