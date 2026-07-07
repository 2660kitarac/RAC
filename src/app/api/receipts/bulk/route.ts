import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, attendances, annualFees, users, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

/**
 * POST /api/receipts/bulk
 * 領収書を一括自動生成する
 *
 * mode = 'external'   : 指定例会の外部参加者（receipt_required=true かつ paid）の領収書を一括発行
 * mode = 'annual_fee' : 指定年度の年会費支払済メンバーの領収書を一括発行
 * mode = 'meeting_all': 指定例会のすべての参加者（receipt_required=true かつ paid）を一括発行
 *
 * リクエストボディ:
 * {
 *   mode: 'external' | 'annual_fee' | 'meeting_all',
 *   clubId?: string,          // 省略時はセッションのclubId
 *   meetingId?: string,       // mode=external / meeting_all 時に必須
 *   fiscalYear?: number,      // mode=annual_fee 時に必須
 *   issuedDate: string,       // 'YYYY-MM-DD' 発行日
 *   description?: string,     // 但し書き（省略時はモードに応じたデフォルト）
 *   targetIds?: string[],     // 対象を絞る場合（attendance_id / annual_fee_id）
 *   skipExisting?: boolean,   // 既存の発行済み領収書をスキップ（デフォルト:true）
 * }
 *
 * レスポンス:
 * {
 *   created: { id, receiptNumber, receiptName, amount, attendanceId?, annualFeeId? }[],
 *   skipped: { id, reason }[],
 *   total: number,
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();
    const {
      mode,
      meetingId,
      fiscalYear,
      issuedDate,
      description,
      targetIds,
      skipExisting = true,
    } = body;

    const resolvedClubId = body.clubId || session.user.clubId;
    if (!resolvedClubId) {
      return NextResponse.json({ error: 'clubId は必須です' }, { status: 400 });
    }
    if (!issuedDate) {
      return NextResponse.json({ error: 'issuedDate は必須です' }, { status: 400 });
    }
    if (!mode || !['external', 'annual_fee', 'meeting_all'].includes(mode)) {
      return NextResponse.json({ error: 'mode は external / annual_fee / meeting_all のいずれかです' }, { status: 400 });
    }

    // クラブ名を取得（領収書の発行元として使う）
    const clubResult = await db.select({ name: clubs.name })
      .from(clubs).where(eq(clubs.id, resolvedClubId)).limit(1);
    const clubName = clubResult[0]?.name || 'ローターアクトクラブ';

    const created: {
      id: string; receiptNumber: string; receiptName: string;
      amount: number; attendanceId?: string; annualFeeId?: string;
    }[] = [];
    const skipped: { id: string; reason: string }[] = [];

    // ────────────────────────────────────────────────────────────
    // mode: external / meeting_all
    // 例会の外部参加者（クラブメンバー以外）の領収書を一括発行
    // ────────────────────────────────────────────────────────────
    if (mode === 'external' || mode === 'meeting_all') {
      if (!meetingId) {
        return NextResponse.json({ error: 'meetingId は external/meeting_all モードで必須です' }, { status: 400 });
      }

      // 例会情報取得
      const meetingResult = await db.select({ title: meetings.title, date: meetings.date })
        .from(meetings).where(eq(meetings.id, meetingId)).limit(1);
      const meeting = meetingResult[0];
      if (!meeting) {
        return NextResponse.json({ error: '例会が見つかりません' }, { status: 404 });
      }

      // 対象出席レコードを取得
      const baseConditions = and(
        eq(attendances.meetingId, meetingId),
        eq(attendances.receiptRequired, true),
        eq(attendances.paymentStatus, 'paid'),
        isNull(attendances.deletedAt),
      );

      // external モード: 外部参加者のみ（userId が null = クラブメンバー以外）
      const attendanceCondition = mode === 'external'
        ? and(baseConditions, isNull(attendances.userId))
        : baseConditions;

      let targetAttendances = await db.select({
        id: attendances.id,
        externalName: attendances.externalName,
        receiptName: attendances.receiptName,
        feeAmount: attendances.feeAmount,
        userId: attendances.userId,
      }).from(attendances).where(attendanceCondition);

      // targetIds で絞り込み
      if (targetIds && targetIds.length > 0) {
        targetAttendances = targetAttendances.filter(a => targetIds.includes(a.id));
      }

      // スキップチェック用：既存の発行済み領収書のattendanceIdリスト
      let existingAttendanceIds = new Set<string>();
      if (skipExisting && targetAttendances.length > 0) {
        const aIds = targetAttendances.map(a => a.id);
        const existingReceipts = await db.select({ attendanceId: receipts.attendanceId })
          .from(receipts)
          .where(and(
            inArray(receipts.attendanceId, aIds),
            eq(receipts.status, 'issued'),
            isNull(receipts.deletedAt),
          ));
        existingAttendanceIds = new Set(existingReceipts.map(r => r.attendanceId!));
      }

      const defaultDesc = description || `${meeting.title} 参加費として`;

      for (const att of targetAttendances) {
        if (skipExisting && existingAttendanceIds.has(att.id)) {
          skipped.push({ id: att.id, reason: '既に領収書が発行済みです' });
          continue;
        }
        if (!att.feeAmount || att.feeAmount <= 0) {
          skipped.push({ id: att.id, reason: '参加費が0円のため発行をスキップ' });
          continue;
        }

        const name = att.receiptName || att.externalName || '（不明）';
        const receiptNumber = `${issuedDate.replace(/-/g, '')}-${randomUUID().substring(0, 4).toUpperCase()}`;
        const id = randomUUID();

        await db.insert(receipts).values({
          id,
          clubId: resolvedClubId,
          meetingId,
          attendanceId: att.id,
          transactionId: null,
          receiptNumber,
          receiptName: name,
          amount: att.feeAmount,
          description: defaultDesc,
          issuedDate,
          status: 'issued',
          issuedBy: session.user.id,
        });

        created.push({ id, receiptNumber, receiptName: name, amount: att.feeAmount, attendanceId: att.id });
      }
    }

    // ────────────────────────────────────────────────────────────
    // mode: annual_fee
    // 年会費支払済メンバーの領収書を一括発行
    // ────────────────────────────────────────────────────────────
    if (mode === 'annual_fee') {
      if (!fiscalYear) {
        return NextResponse.json({ error: 'fiscalYear は annual_fee モードで必須です' }, { status: 400 });
      }

      // 支払済の年会費レコード取得（ユーザー名付き）
      let targetFees = await db.select({
        id: annualFees.id,
        userId: annualFees.userId,
        amount: annualFees.amount,
        paidAt: annualFees.paidAt,
        userName: users.name,
      })
        .from(annualFees)
        .leftJoin(users, eq(annualFees.userId, users.id))
        .where(and(
          eq(annualFees.clubId, resolvedClubId),
          eq(annualFees.fiscalYear, Number(fiscalYear)),
          eq(annualFees.paymentStatus, 'paid'),
          isNull(annualFees.deletedAt),
        ));

      // targetIds で絞り込み
      if (targetIds && targetIds.length > 0) {
        targetFees = targetFees.filter(f => targetIds.includes(f.id));
      }

      // スキップチェック：description に年会費が含まれる領収書の receiptName リストから判断
      // annualFeeId を保持するカラムがないため、receipt_name + amount + issued_date の重複を年度ベースでチェック
      // → 同じユーザーの同年度の年会費領収書を重複発行しないよう、既存確認
      let existingAnnualFeeIds = new Set<string>();
      if (skipExisting && targetFees.length > 0) {
        const feeIds = targetFees.map(f => f.id);
        // receipts に annualFeeId カラムがないため、description + receiptName でチェック
        // 実用的な方法：同じ receiptName かつ description に年会費が含まれる領収書が存在するか
        // ここでは保守的にユーザー名で検索
        const userNames = targetFees.map(f => f.userName).filter(Boolean) as string[];
        if (userNames.length > 0) {
          const existingR = await db.select({ receiptName: receipts.receiptName, description: receipts.description })
            .from(receipts)
            .where(and(
              eq(receipts.clubId, resolvedClubId),
              eq(receipts.status, 'issued'),
              isNull(receipts.deletedAt),
            ));
          // 年会費の但し書きで絞り込み
          const annualFeeReceipts = existingR.filter(r =>
            r.description?.includes('年会費') || r.description === description
          );
          const existingNames = new Set(annualFeeReceipts.map(r => r.receiptName));
          // 対象フィーのIDで既存発行済みをチェック
          existingAnnualFeeIds = new Set(
            targetFees.filter(f => f.userName && existingNames.has(f.userName)).map(f => f.id)
          );
        }
      }

      const defaultDesc = description || `${fiscalYear}年度 年会費として`;

      for (const fee of targetFees) {
        if (skipExisting && existingAnnualFeeIds.has(fee.id)) {
          skipped.push({ id: fee.id, reason: `${fee.userName} の年会費領収書は既に発行済みです` });
          continue;
        }
        if (!fee.amount || fee.amount <= 0) {
          skipped.push({ id: fee.id, reason: '金額が0円のためスキップ' });
          continue;
        }

        const name = fee.userName || '（不明）';
        const receiptNumber = `${issuedDate.replace(/-/g, '')}-${randomUUID().substring(0, 4).toUpperCase()}`;
        const id = randomUUID();

        await db.insert(receipts).values({
          id,
          clubId: resolvedClubId,
          meetingId: null,
          attendanceId: null,
          transactionId: null,
          receiptNumber,
          receiptName: name,
          amount: fee.amount,
          description: defaultDesc,
          issuedDate,
          status: 'issued',
          issuedBy: session.user.id,
        });

        created.push({ id, receiptNumber, receiptName: name, amount: fee.amount, annualFeeId: fee.id });
      }
    }

    return NextResponse.json({
      created,
      skipped,
      total: created.length,
      message: `${created.length}件の領収書を発行しました${skipped.length > 0 ? `（${skipped.length}件スキップ）` : ''}`,
    }, { status: 201 });

  } catch (error) {
    console.error('POST /api/receipts/bulk error:', error);
    return NextResponse.json({ error: '一括発行に失敗しました' }, { status: 500 });
  }
}

/**
 * GET /api/receipts/bulk?mode=external&meetingId=xxx
 *               または ?mode=annual_fee&fiscalYear=2024&clubId=xxx
 *
 * 一括発行の対象候補一覧を返す（プレビュー用）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode');
    const meetingId = url.searchParams.get('meetingId');
    const fiscalYear = url.searchParams.get('fiscalYear');
    const resolvedClubId = url.searchParams.get('clubId') || session.user.clubId;

    if (!resolvedClubId) {
      return NextResponse.json({ error: 'clubId は必須です' }, { status: 400 });
    }

    if (mode === 'external' || mode === 'meeting_all') {
      if (!meetingId) {
        return NextResponse.json({ error: 'meetingId は必須です' }, { status: 400 });
      }

      const baseConditions = and(
        eq(attendances.meetingId, meetingId),
        eq(attendances.receiptRequired, true),
        eq(attendances.paymentStatus, 'paid'),
        isNull(attendances.deletedAt),
      );
      const condition = mode === 'external'
        ? and(baseConditions, isNull(attendances.userId))
        : baseConditions;

      const results = await db.select({
        id: attendances.id,
        externalName: attendances.externalName,
        receiptName: attendances.receiptName,
        feeAmount: attendances.feeAmount,
        userId: attendances.userId,
        userName: users.name,
      })
        .from(attendances)
        .leftJoin(users, eq(attendances.userId, users.id))
        .where(condition);

      // 既存発行済みチェック
      const existingReceipts = await db.select({ attendanceId: receipts.attendanceId })
        .from(receipts)
        .where(and(
          eq(receipts.clubId, resolvedClubId),
          eq(receipts.status, 'issued'),
          isNull(receipts.deletedAt),
        ));
      const existingAttendanceIds = new Set(existingReceipts.map(r => r.attendanceId));

      return NextResponse.json({
        targets: results.map(a => ({
          id: a.id,
          name: a.receiptName || a.externalName || a.userName || '（不明）',
          amount: a.feeAmount,
          isClubMember: !!a.userId,
          alreadyIssued: existingAttendanceIds.has(a.id),
        })),
      });
    }

    if (mode === 'annual_fee') {
      if (!fiscalYear) {
        return NextResponse.json({ error: 'fiscalYear は必須です' }, { status: 400 });
      }

      const results = await db.select({
        id: annualFees.id,
        userId: annualFees.userId,
        amount: annualFees.amount,
        paymentStatus: annualFees.paymentStatus,
        paidAt: annualFees.paidAt,
        userName: users.name,
      })
        .from(annualFees)
        .leftJoin(users, eq(annualFees.userId, users.id))
        .where(and(
          eq(annualFees.clubId, resolvedClubId),
          eq(annualFees.fiscalYear, Number(fiscalYear)),
          eq(annualFees.paymentStatus, 'paid'),
          isNull(annualFees.deletedAt),
        ));

      return NextResponse.json({
        targets: results.map(f => ({
          id: f.id,
          name: f.userName || '（不明）',
          amount: f.amount,
          paidAt: f.paidAt,
        })),
      });
    }

    return NextResponse.json({ error: 'mode パラメータが必要です' }, { status: 400 });
  } catch (error) {
    console.error('GET /api/receipts/bulk error:', error);
    return NextResponse.json({ error: '候補一覧の取得に失敗しました' }, { status: 500 });
  }
}
