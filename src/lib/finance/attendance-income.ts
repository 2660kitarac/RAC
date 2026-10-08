/**
 * 例会参加費の会計への自動計上（サーバー専用）
 *
 * 出席登録が「支払済み」になったら収入として計上し、支払済みが取り消されたら計上も取り消す。
 * 出欠管理・当日受付・例会詳細の一括操作など、どの画面から支払済みにしても同じ結果になるよう、
 * 出席情報を更新する API の中から呼び出す。
 *
 * 重複防止のため、計上した取引の説明には末尾に [出席ID] を入れる。
 */
import { and, eq, isNull, like } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { attendances, meetings, transactions, users } from '@/lib/db/schema';
import { todayJst } from '@/lib/meetings/deadline';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const marker = (attendanceId: string) => `%[${attendanceId}]`;

/** 支払済みの出席登録を収入として計上する。計上した取引IDを返す（対象外・計上済みは null） */
export async function postAttendanceIncome(
  db: Db,
  attendanceId: string,
  actorId: string | null,
): Promise<string | null> {
  const [a] = await db
    .select({
      id: attendances.id,
      meetingId: attendances.meetingId,
      userId: attendances.userId,
      externalName: attendances.externalName,
      feeAmount: attendances.feeAmount,
      paymentStatus: attendances.paymentStatus,
      paymentMethod: attendances.paymentMethod,
    })
    .from(attendances)
    .where(and(eq(attendances.id, attendanceId), isNull(attendances.deletedAt)))
    .limit(1);
  if (!a || a.paymentStatus !== 'paid' || !a.feeAmount) return null;

  const [m] = await db
    .select({ clubId: meetings.clubId, title: meetings.title })
    .from(meetings)
    .where(eq(meetings.id, a.meetingId))
    .limit(1);
  if (!m) return null;

  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(
      eq(transactions.clubId, m.clubId),
      eq(transactions.meetingId, a.meetingId),
      like(transactions.description, marker(attendanceId)),
      isNull(transactions.deletedAt),
    ))
    .limit(1);
  if (existing) return null;

  let payer: string | null = a.externalName || null;
  if (!payer && a.userId) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, a.userId)).limit(1);
    payer = u?.name ?? null;
  }

  const id = randomUUID();
  await db.insert(transactions).values({
    id,
    clubId: m.clubId,
    meetingId: a.meetingId,
    transactionType: 'income',
    category: 'meeting_fee',
    amount: a.feeAmount,
    payerName: payer,
    paymentMethod: a.paymentMethod || null,
    description: `例会参加費：${m.title}${payer ? `（${payer}）` : ''} [${attendanceId}]`,
    transactionDate: todayJst(),
    createdBy: actorId,
  });
  return id;
}

/** 自動計上した参加費の取引を取り消す（支払済みの取り消し・登録の削除時）。取り消した件数を返す */
export async function cancelAttendanceIncome(db: Db, attendanceId: string): Promise<number> {
  const rows = await db
    .update(transactions)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(
      eq(transactions.category, 'meeting_fee'),
      like(transactions.description, marker(attendanceId)),
      isNull(transactions.deletedAt),
    ))
    .returning({ id: transactions.id });
  return rows.length;
}
