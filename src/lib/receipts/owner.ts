import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { receipts } from '@/lib/db/schema';

/**
 * 会員本人の領収書（発行済み・未削除）の条件。
 * 会員画面（マイ領収書・会員トップページ）で使う。クラブの条件は呼び出し側で併せてかける。
 */
export function ownReceiptsCondition(userId: string): SQL {
  return and(
    eq(receipts.userId, userId),
    eq(receipts.status, 'issued'),
    isNull(receipts.deletedAt),
  )!;
}

/**
 * 手入力で発行する領収書に記録する会員ID。
 * 指定された出欠記録が、発行するクラブの例会のものであるときだけ、その会員を持ち主にする
 * （他クラブの出欠記録を指定して、他人の領収書として記録されるのを防ぐ）。
 */
export function receiptOwnerFromAttendance(
  attendance: { userId: string | null; meetingClubId: string | null } | null | undefined,
  issuingClubId: string,
): string | null {
  if (!attendance?.userId) return null;
  if (attendance.meetingClubId !== issuingClubId) return null;
  return attendance.userId;
}
