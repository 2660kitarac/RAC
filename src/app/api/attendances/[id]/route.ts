import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances, meetings } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canMutateClubRecord } from '@/lib/auth/tenant';

/**
 * 対象の出席レコードを取得し、操作権限を検証する。
 * 出席レコードは例会（meetings.clubId）経由でクラブに紐づくため、
 * 例会の所有クラブを見て判定する。
 */
async function loadAndAuthorize(
  db: any,
  sessionUser: any,
  id: string,
): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const [record] = await db
    .select({
      id: attendances.id,
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

  if (!canMutateClubRecord(sessionUser, ownerClubId)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: '他クラブの出席情報は操作できません' },
        { status: 403 },
      ),
    };
  }

  return { ok: true };
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
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db
      .update(attendances)
      .set(updateData as any)
      .where(and(eq(attendances.id, id), isNull(attendances.deletedAt)));

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

    await db
      .update(attendances)
      .set({ deletedAt: new Date().toISOString() } as any)
      .where(and(eq(attendances.id, id), isNull(attendances.deletedAt)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/attendances/[id] error:', error);
    return NextResponse.json({ error: '出席情報の削除に失敗しました' }, { status: 500 });
  }
}
