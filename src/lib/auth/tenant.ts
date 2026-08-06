/**
 * マルチテナント（クラブ）アクセス制御ヘルパー
 *
 * Server Component / API Route の両方から使えるように
 * 'use client' を持たない純粋関数のみで構成する。
 * （@/lib/hooks/useAuth は 'use client' 付きのため、サーバー側では本モジュールを使う）
 *
 * 方針:
 *  - 地区スタッフ（system_owner / district_admin）のみクラブ横断参照が可能
 *  - それ以外のロールは常に session.user.clubId に強制的に閉じ込める
 *  - クエリパラメータの clubId / userId は信頼しない（IDOR 対策）
 */

/** 地区スタッフ（全クラブ横断参照が許されるロール） */
const DISTRICT_STAFF_ROLES = [
  'system_owner',
  'district_admin',
  'district_representative',
  'district_secretary',
] as const;

export type SessionUserLike = {
  id?: string | null;
  role?: string | null;
  clubId?: string | null;
} | null | undefined;

/** 地区スタッフかどうか（クラブ横断参照の可否） */
export function isDistrictScope(role: string | null | undefined): boolean {
  if (!role) return false;
  return (DISTRICT_STAFF_ROLES as readonly string[]).includes(role);
}

/**
 * 参照して良い clubId を解決する。
 *
 * @param user     セッションユーザー
 * @param requested クエリ等で要求された clubId（信頼しない）
 * @returns
 *   - clubId:     絞り込みに使うクラブID（null なら クラブ指定なし）
 *   - crossClub:  true の場合はクラブ横断参照（地区スタッフが clubId 未指定時）
 *   - forbidden:  true の場合は他クラブを要求したため拒否すべき
 */
export function resolveClubScope(
  user: SessionUserLike,
  requested?: string | null,
): { clubId: string | null; crossClub: boolean; forbidden: boolean } {
  const sessionClubId = user?.clubId ?? null;

  // 地区スタッフは任意のクラブを指定可能。未指定なら全クラブ横断。
  if (isDistrictScope(user?.role)) {
    if (requested) return { clubId: requested, crossClub: false, forbidden: false };
    return { clubId: null, crossClub: true, forbidden: false };
  }

  // クラブに属していないアカウント（個人会員で未所属など）は
  // クラブ単位の参照を一切許可しない
  if (!sessionClubId) {
    return { clubId: null, crossClub: false, forbidden: false };
  }

  // 自クラブ以外を要求した場合は拒否
  if (requested && requested !== sessionClubId) {
    return { clubId: sessionClubId, crossClub: false, forbidden: true };
  }

  // 常に自クラブへ強制
  return { clubId: sessionClubId, crossClub: false, forbidden: false };
}

/**
 * 対象レコードの clubId を操作して良いか判定する。
 * （PATCH / DELETE の所有検証に使用）
 */
export function canMutateClubRecord(
  user: SessionUserLike,
  recordClubId: string | null | undefined,
): boolean {
  if (isDistrictScope(user?.role)) return true;
  const sessionClubId = user?.clubId ?? null;
  if (!sessionClubId || !recordClubId) return false;
  return sessionClubId === recordClubId;
}
