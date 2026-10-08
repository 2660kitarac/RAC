import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances, meetings } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canMutateClubRecord, canManageClub } from '@/lib/auth/tenant';
import { postAttendanceIncome, cancelAttendanceIncome } from '@/lib/finance/attendance-income';

/**
 * 対象の出席レコードを取得し、操作権限を検証する。
 * 出席レコードは例会（meetings.clubId）経由でクラブに紐づくため、
 * 例会の所有クラブを見て判定する。
 */
async function loadAndAuthorize(
  db: any,
  sessionUser: any,
  id: string,
): Promise<
  | { ok: true; isOwner: boolean; locked: boolean; paymentStatus: string | null; feeAmount: number | null }
  | { ok: false; res: NextResponse }
> {
  const [record] = await db
    .select({
      id: attendances.id,
      userId: attendances.userId,
      paymentStatus: attendances.paymentStatus,
      feeAmount: attendances.feeAmount,
      attendanceStatus: attendances.attendanceStatus,
      meetingFinishedAt: meetings.finishedAt,
      attendanceClubId: attendances.clubId,
      meetingClubId: meetings.clubId,
    })
    .from(attendances)
    .leftJoin(meetings, eq(attendances.meetingId, meetings.id))
    .where(and(eq(attendances.id, id), isNull(attendances.deletedAt)))
    .limit(1);

  if (!record) {
    return {
      ok: false,
      res: NextResponse.json({ error: '出席情報が見つかりません' }, { status: 404 }),
    };
  }

  // 例会の所有クラブを優先して判定（MU登録では attendances.clubId は訪問元クラブが入る）
  const ownerClubId = record.meetingClubId ?? record.attendanceClubId;

  // 本人の登録は、他クラブの例会でも本人が取り消し・一部修正できる
  const isOwner = !!record.userId && record.userId === sessionUser?.id;
  if (isOwner && !(canManageClub(sessionUser?.role) && canMutateClubRecord(sessionUser, ownerClubId))) {
    // 支払済み・出席確定・例会終了後の登録は、本人では取り消し・変更できない（記録を残すため）
    const locked = record.paymentStatus === 'paid'
      || record.attendanceStatus === 'present'
      || !!record.meetingFinishedAt;
    return { ok: true, isOwner: true, locked, paymentStatus: record.paymentStatus, feeAmount: record.feeAmount };
  }

  // それ以外は、例会を主催するクラブの運営ロールのみ（一般会員が他人の支払状況等を変えられないように）
  if (!canManageClub(sessionUser?.role) || !canMutateClubRecord(sessionUser, ownerClubId)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: '他クラブの出席情報は操作できません' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, isOwner: false, locked: false, paymentStatus: record.paymentStatus, feeAmount: record.feeAmount };
}

// PATCH /api/attendances/[id] - 出席情報更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();
    const sessionUser = session.user as any;

    // ---- 所有クラブ検証（他クラブのレコードは操作不可） ----
    const authz = await loadAndAuthorize(db, sessionUser, id);
    if (!authz.ok) return authz.res;
    if (authz.isOwner && authz.locked) {
      return NextResponse.json(
        { error: '支払済み・出席確定済み、または終了した例会の登録は変更できません。主催クラブにお問い合わせください' },
        { status: 400 },
      );
    }

    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    // clubId / meetingId / userId はクライアントから変更させない（テナント移動の防止）
    const allowedFields = [
      'attendanceStatus', 'mealRequired', 'feeAmount', 'paymentStatus',
      'paymentMethod', 'paidAt', 'receiptRequired', 'receiptNameType',
      'receiptName', 'note', 'memberType',
      // 参加形態（懇親会対応）
      'participationType', 'afterPartyFeeAmount',
      // 参加者基本情報（管理者による修正用 Issue #2）
      'externalName', 'externalEmail', 'externalPhone', 'clubName',
    ];
    // 本人による修正は、金額・支払・出欠確定に関わらない項目に限る
    const ownerFields = ['receiptRequired', 'receiptNameType', 'receiptName', 'note', 'externalPhone'];
    const fields = authz.isOwner ? ownerFields : allowedFields;
    for (const field of fields) {
      if (field in body) updateData[field] = body[field];
    }

    await db
      .update(attendances)
      .set(updateData as any)
      .where(and(eq(attendances.id, id), isNull(attendances.deletedAt)));

    // ---- 会計への自動計上（どの画面から支払済みにしても同じ結果にする） ----
    const newStatus = (updateData.paymentStatus as string | undefined) ?? authz.paymentStatus;
    const statusChanged = 'paymentStatus' in updateData && updateData.paymentStatus !== authz.paymentStatus;
    const feeChanged = 'feeAmount' in updateData && Number(updateData.feeAmount) !== Number(authz.feeAmount);
    if (statusChanged || feeChanged) {
      try {
        let cancelled = 0;
        if (authz.paymentStatus === 'paid' && (newStatus !== 'paid' || feeChanged)) {
          cancelled = await cancelAttendanceIncome(db, id);
        }
        // 新たに支払済みになったとき、または自動計上済みの金額を直したときに計上する
        // （この機能より前に手入力で記帳した支払いは、金額を直しても二重計上しない）
        if (newStatus === 'paid' && (statusChanged || cancelled > 0)) {
          await postAttendanceIncome(db, id, sessionUser.id ?? null);
        }
      } catch (e) {
        // 計上に失敗しても出席情報の更新は成功扱い（会計画面で手入力できる）
        console.error('attendance income sync error:', e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/attendances/[id] error:', error);
    return NextResponse.json({ error: '出席情報の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/attendances/[id] - 論理削除
export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();
    const sessionUser = session.user as any;

    // ---- 所有クラブ検証（他クラブのレコードは削除不可） ----
    const authz = await loadAndAuthorize(db, sessionUser, id);
    if (!authz.ok) return authz.res;
    if (authz.isOwner && authz.locked) {
      return NextResponse.json(
        { error: '支払済み・出席確定済み、または終了した例会の登録は変更できません。主催クラブにお問い合わせください' },
        { status: 400 },
      );
    }

    await db
      .update(attendances)
      .set({ deletedAt: new Date().toISOString() } as any)
      .where(and(eq(attendances.id, id), isNull(attendances.deletedAt)));

    // 自動計上した参加費も取り消す
    if (authz.paymentStatus === 'paid') {
      await cancelAttendanceIncome(db, id).catch(e => console.error('attendance income cancel error:', e));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/attendances/[id] error:', error);
    return NextResponse.json({ error: '出席情報の削除に失敗しました' }, { status: 500 });
  }
}
