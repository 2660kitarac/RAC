/**
 * 例会参加費の会計への自動計上（サーバー専用）
 *
 * 出席登録が「支払済み」になったら収入として計上し、支払済みが取り消されたら計上も取り消す。
 * 出欠管理・当日受付・例会詳細の一括操作・取り込みなど、どこから出席情報を変えても
 * 同じ結果になるよう、出席情報を更新する API の中から syncAttendanceIncome を呼ぶ。
 *
 * - 計上した取引の説明の末尾に [出席ID] を入れ、これで自動計上分を見分ける
 * - 同時に操作されても二重計上しないよう、出席IDごとのロックを取ってトランザクション内で判定する
 * - この機能より前に手入力で記帳した支払い（目印なし）には触れない
 */
import { and, eq, isNull, like, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { attendances, meetings, transactions, users } from '@/lib/db/schema';
import { todayJst } from '@/lib/meetings/deadline';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const marker = (attendanceId: string) => `%[${attendanceId}]`;

export type IncomeSyncResult = 'posted' | 'reposted' | 'cancelled' | 'unchanged';

/**
 * 出席登録の現在の状態に合わせて、自動計上分の取引をそろえる。
 *
 * @param allowNewPost 自動計上分がまだ無いときに新しく計上してよいか。
 *   「未払い→支払済み」に変わったときだけ true にする。金額の修正だけのときは false
 *   （手入力で記帳済みの支払いを二重計上しないため）。
 */
export async function syncAttendanceIncome(
  db: Db,
  attendanceId: string,
  actorId: string | null,
  { allowNewPost }: { allowNewPost: boolean },
): Promise<IncomeSyncResult> {
  return db.transaction(async (tx: Db) => {
    // 同じ出席登録への同時操作を直列化する（ダブルクリック・別タブでの二重計上を防ぐ）
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'attendance-income:' + attendanceId}))`);

    const [a] = await tx
      .select({
        meetingId: attendances.meetingId,
        userId: attendances.userId,
        externalName: attendances.externalName,
        feeAmount: attendances.feeAmount,
        paymentStatus: attendances.paymentStatus,
        paymentMethod: attendances.paymentMethod,
        deletedAt: attendances.deletedAt,
      })
      .from(attendances)
      .where(eq(attendances.id, attendanceId))
      .limit(1);
    if (!a) return 'unchanged';

    const [m] = await tx
      .select({ clubId: meetings.clubId, title: meetings.title })
      .from(meetings)
      .where(eq(meetings.id, a.meetingId))
      .limit(1);
    if (!m) return 'unchanged';

    const existing = await tx
      .select({ id: transactions.id, amount: transactions.amount })
      .from(transactions)
      .where(and(
        eq(transactions.clubId, m.clubId),
        eq(transactions.category, 'meeting_fee'),
        like(transactions.description, marker(attendanceId)),
        isNull(transactions.deletedAt),
      ));

    const shouldBePosted = !a.deletedAt && a.paymentStatus === 'paid' && (a.feeAmount ?? 0) > 0;
    const now = new Date().toISOString();

    const cancelAll = async () => {
      for (const t of existing) {
        await tx.update(transactions).set({ deletedAt: now }).where(eq(transactions.id, t.id));
      }
    };

    if (!shouldBePosted) {
      if (existing.length === 0) return 'unchanged';
      await cancelAll();
      return 'cancelled';
    }

    // すでに正しい金額で計上済みなら何もしない
    if (existing.length === 1 && existing[0].amount === a.feeAmount) return 'unchanged';
    if (existing.length === 0 && !allowNewPost) return 'unchanged';

    const reposting = existing.length > 0;
    await cancelAll();

    let payer: string | null = a.externalName || null;
    if (!payer && a.userId) {
      const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, a.userId)).limit(1);
      payer = u?.name ?? null;
    }

    await tx.insert(transactions).values({
      id: randomUUID(),
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
    return reposting ? 'reposted' : 'posted';
  });
}

/** 計上の失敗で本来の操作（出席情報の更新）を失敗させないためのラッパー */
export async function syncAttendanceIncomeSafely(
  db: Db,
  attendanceId: string,
  actorId: string | null,
  opts: { allowNewPost: boolean },
): Promise<void> {
  try {
    await syncAttendanceIncome(db, attendanceId, actorId, opts);
  } catch (e) {
    // 会計画面から手入力で補えるため、ログだけ残す
    console.error('attendance income sync error:', attendanceId, e);
  }
}
