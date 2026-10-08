import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances, users, meetings } from '@/lib/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { resolveClubScope, canManageClub, canMutateClubRecord } from '@/lib/auth/tenant';
import { calculateFee } from '@/lib/utils';
import { evaluateDeadline } from '@/lib/meetings/deadline';

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
//
// 権限の考え方:
//  - 例会を主催するクラブの運営ロール（と地区スタッフ）… 代理登録として入力値をそのまま使う
//  - それ以外（未ログインの外部参加者・一般会員・他クラブ）… MU登録のみ可。
//    本人以外の userId・支払状況・出席確定・金額はクライアントの値を信用せず、
//    参加費はサーバー側で例会の設定から計算する
const MEMBER_TYPES = ['RAC', 'RC', 'OB_OG', 'GUEST', 'OTHER'];
const PARTICIPATION_TYPES = ['meeting_only', 'meeting_and_party', 'party_only', 'absent'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const isMuRegistration = body.registrationType === 'mu';

    const session = await auth();
    const sessionUser = (session?.user ?? null) as { id?: string; role?: string; clubId?: string | null } | null;

    if (!isMuRegistration && !sessionUser) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const db = await getDbFromContext();
    const {
      meetingId, userId, externalName, externalEmail, externalPhone,
      clubId, clubName, memberType, attendanceStatus, registrationType,
      mealRequired, feeAmount, paymentStatus, paymentMethod,
      receiptRequired, receiptNameType, receiptName, note,
      participationType, afterPartyFeeAmount,
    } = body;

    if (!meetingId || typeof meetingId !== 'string') {
      return NextResponse.json({ error: 'meetingId は必須です' }, { status: 400 });
    }

    // MU登録は外部名前+メールが必須
    if (isMuRegistration && !externalName && !userId) {
      return NextResponse.json({ error: 'お名前は必須です' }, { status: 400 });
    }

    // ---- 締切・ステータス判定（ポリシー対応）----
    // MU登録（外部フォーム）にも同じルールを適用する。
    // 運営側からの代理登録（認証済み）は締切判定をスキップし、遅延フラグのみ付与する。
    const [meetingRow] = await db
      .select({
        clubId: meetings.clubId,
        registrationDeadline: meetings.registrationDeadline,
        deadlinePolicy: meetings.deadlinePolicy,
        status: meetings.status,
        finishedAt: meetings.finishedAt,
        date: meetings.date,
        feeRac: meetings.feeRac,
        feeRc: meetings.feeRc,
        feeObog: meetings.feeObog,
        feeGuest: meetings.feeGuest,
        mealFee: meetings.mealFee,
        ownClubFee: meetings.ownClubFee,
        hasAfterParty: meetings.hasAfterParty,
        afterPartyFeeRac: meetings.afterPartyFeeRac,
        afterPartyFeeRc: meetings.afterPartyFeeRc,
        afterPartyFeeObog: meetings.afterPartyFeeObog,
        afterPartyFeeGuest: meetings.afterPartyFeeGuest,
        afterPartyAllowPartyOnly: meetings.afterPartyAllowPartyOnly,
      })
      .from(meetings)
      .where(and(eq(meetings.id, meetingId), isNull(meetings.deletedAt)))
      .limit(1);

    if (!meetingRow) {
      return NextResponse.json({ error: '例会が見つかりません' }, { status: 404 });
    }

    // 主催クラブの運営ロール（または地区スタッフ）による代理登録か
    const isTrustedStaff = !!sessionUser
      && canManageClub(sessionUser.role)
      && canMutateClubRecord(sessionUser, meetingRow.clubId);

    // MU登録以外（運営側の登録）は主催クラブの運営ロールのみ
    if (!isMuRegistration && !isTrustedStaff) {
      return NextResponse.json({ error: 'この例会に登録する権限がありません' }, { status: 403 });
    }

    const deadlineCheck = evaluateDeadline(meetingRow as any);

    if (isMuRegistration && !deadlineCheck.allowed) {
      return NextResponse.json({
        error: deadlineCheck.message || '登録を受け付けられません',
        reason: deadlineCheck.reason,
      }, { status: 400 });
    }

    const common = {
      meetingId,
      externalName: externalName || null,
      externalEmail: externalEmail || null,
      externalPhone: externalPhone || null,
      clubId: clubId || null,
      clubName: clubName || null,
      isLateRegistration: deadlineCheck.isLate,
      registeredAfterDeadlineDays: deadlineCheck.daysLate,
      receiptRequired: receiptRequired ?? false,
      receiptNameType: receiptNameType || null,
      receiptName: receiptName || null,
      note: note || null,
    };

    let values: Record<string, unknown>;

    if (isTrustedStaff) {
      // 運営側の代理登録：入力値をそのまま使う（従来どおり）
      values = {
        ...common,
        userId: userId || null,
        memberType: memberType || 'RAC',
        attendanceStatus: attendanceStatus || 'undecided',
        registrationType: registrationType || 'member',
        mealRequired: deadlineCheck.mealAllowed ? (mealRequired ?? false) : false,
        feeAmount: feeAmount ?? 0,
        paymentStatus: paymentStatus || 'unpaid',
        paymentMethod: paymentMethod || null,
        participationType: participationType || 'meeting_only',
        afterPartyFeeAmount: afterPartyFeeAmount ?? 0,
      };
    } else {
      // 外部参加者・一般会員のMU登録：本人以外としては登録させない
      const ownUserId = sessionUser?.id && userId && userId === sessionUser.id ? sessionUser.id : null;
      const isOwnClubMember = !!ownUserId && !!sessionUser?.clubId && sessionUser.clubId === meetingRow.clubId;

      const pType = participationType || 'meeting_only';
      if (!PARTICIPATION_TYPES.includes(pType)) {
        return NextResponse.json({ error: '参加形態が正しくありません' }, { status: 400 });
      }
      if (pType === 'absent' && !isOwnClubMember) {
        return NextResponse.json({ error: '欠席登録は主催クラブの会員のみ行えます' }, { status: 400 });
      }
      const withParty = pType === 'meeting_and_party' || pType === 'party_only';
      if (withParty && !meetingRow.hasAfterParty) {
        return NextResponse.json({ error: 'この例会には懇親会がありません' }, { status: 400 });
      }
      if (pType === 'party_only' && !meetingRow.afterPartyAllowPartyOnly) {
        return NextResponse.json({ error: 'この例会は懇親会のみの参加を受け付けていません' }, { status: 400 });
      }

      const mType = isOwnClubMember ? 'RAC' : (MEMBER_TYPES.includes(memberType) ? memberType : 'GUEST');
      const isAbsent = pType === 'absent';
      const meal = !isAbsent && deadlineCheck.mealAllowed ? !!mealRequired : false;

      // 参加費はサーバー側で例会の設定から計算する（画面の計算と同じ式）
      const meetingFee = (isAbsent || pType === 'party_only')
        ? 0
        : calculateFee(mType, {
            fee_rac: meetingRow.feeRac, fee_rc: meetingRow.feeRc,
            fee_obog: meetingRow.feeObog, fee_guest: meetingRow.feeGuest,
            own_club_fee: meetingRow.ownClubFee,
          }, meal, meetingRow.mealFee, isOwnClubMember);
      const partyFeeByType: Record<string, number> = {
        RAC: meetingRow.afterPartyFeeRac, RC: meetingRow.afterPartyFeeRc,
        OB_OG: meetingRow.afterPartyFeeObog, GUEST: meetingRow.afterPartyFeeGuest,
      };
      const partyFee = withParty ? (partyFeeByType[mType] ?? meetingRow.afterPartyFeeGuest ?? 0) : 0;

      values = {
        ...common,
        userId: ownUserId,
        memberType: mType,
        attendanceStatus: isAbsent ? 'absent' : 'undecided',
        registrationType: 'mu',
        mealRequired: meal,
        feeAmount: meetingFee,
        paymentStatus: isAbsent ? 'exempt' : 'unpaid',
        paymentMethod: null,
        participationType: pType,
        afterPartyFeeAmount: partyFee,
      };
    }

    const id = randomUUID();
    await db.insert(attendances).values({ id, ...values } as any);

    return NextResponse.json({
      id,
      success: true,
      isLateRegistration: deadlineCheck.isLate,
      lateMessage: deadlineCheck.isLate ? deadlineCheck.message : undefined,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/attendances error:', error);
    return NextResponse.json({ error: '出席登録に失敗しました' }, { status: 500 });
  }
}
