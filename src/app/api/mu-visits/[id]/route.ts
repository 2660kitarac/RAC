import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { muVisits, transactions } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canMutateClubRecord, isDistrictScope, canManageClub } from '@/lib/auth/tenant';

/**
 * 対象MU訪問レコードを取得し、操作権限を検証する。
 * 権限がなければ NextResponse（エラー）を返す。
 */
async function loadAndAuthorize(
  db: any,
  sessionUser: any,
  id: string,
): Promise<{ ok: true; clubId: string | null; transactionId: string | null } | { ok: false; res: NextResponse }> {
  // 精算状況・金額の変更や削除は会計に影響するため、運営ロールに限定する
  if (!canManageClub(sessionUser?.role)) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'MU訪問履歴を操作する権限がありません' }, { status: 403 }),
    };
  }

  const [record] = await db
    .select({ id: muVisits.id, clubId: muVisits.clubId, transactionId: muVisits.transactionId })
    .from(muVisits)
    .where(and(eq(muVisits.id, id), isNull(muVisits.deletedAt)))
    .limit(1);

  if (!record) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'MU訪問履歴が見つかりません' }, { status: 404 }),
    };
  }

  if (!canMutateClubRecord(sessionUser, record.clubId)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: '他クラブのMU訪問履歴は操作できません' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, clubId: record.clubId, transactionId: record.transactionId ?? null };
}

// PATCH /api/mu-visits/[id] - 精算済みに更新 or 内容修正
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

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updatedAt: now };

    // clubId / userId / transactionId はクライアントから変更させない
    // （テナント移動や、他の会計レコードへの付け替えを防ぐ）
    const allowedFields = [
      'visitedClubName', 'visitDate', 'feeAmount', 'note',
      'settlementStatus', 'settledAt', 'settledBy',
    ];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    // 精算済みにする場合は settledAt・settledBy を自動セット
    if (body.settlementStatus === 'settled') {
      updateData.settledAt = updateData.settledAt || now;
      updateData.settledBy = updateData.settledBy || session.user.id;
    }

    // WHERE 句にも clubId 条件を付与（二重防御）
    const scopeCondition = isDistrictScope(sessionUser.role)
      ? undefined
      : eq(muVisits.clubId, sessionUser.clubId);

    await db
      .update(muVisits)
      .set(updateData as any)
      .where(and(eq(muVisits.id, id), isNull(muVisits.deletedAt), scopeCondition));

    // 立替金額を直したときは、自動計上した会計の金額もそろえる
    if (authz.transactionId && 'feeAmount' in body) {
      const amount = Number(body.feeAmount);
      if (Number.isFinite(amount) && amount >= 0) {
        await db
          .update(transactions)
          .set({ amount, updatedAt: now } as any)
          .where(and(eq(transactions.id, authz.transactionId), isNull(transactions.deletedAt)));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/mu-visits/[id] error:', error);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/mu-visits/[id] - 論理削除
export async function DELETE(
  _req: NextRequest,
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

    // WHERE 句にも clubId 条件を付与（二重防御）
    const scopeCondition = isDistrictScope(sessionUser.role)
      ? undefined
      : eq(muVisits.clubId, sessionUser.clubId);

    const deletedAt = new Date().toISOString();
    await db
      .update(muVisits)
      .set({ deletedAt } as any)
      .where(and(eq(muVisits.id, id), isNull(muVisits.deletedAt), scopeCondition));

    // 自動計上した立替の会計レコードも取り消す（帳簿に残らないように）
    if (authz.transactionId) {
      await db
        .update(transactions)
        .set({ deletedAt } as any)
        .where(and(eq(transactions.id, authz.transactionId), isNull(transactions.deletedAt)));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/mu-visits/[id] error:', error);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
