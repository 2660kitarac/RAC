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

/* ============================================================
 * ロール別の操作権限（サーバー側判定）
 *
 * @/lib/hooks/useAuth は 'use client' のため API Route からは
 * 使えない。API Route / Server Component からは以下を使う。
 * ============================================================ */

/** 会計（取引・年会費・寄付・領収書）を操作できるロール */
const FINANCE_MANAGER_ROLES = [
  'system_owner',
  'district_admin',
  'district_representative',
  'district_secretary',
  'club_account',
  'club_admin',
  'president',
  'treasurer',
] as const;

/** クラブ運営（例会・メールテンプレート等）を操作できるロール */
const CLUB_MANAGER_ROLES = [
  'system_owner',
  'district_admin',
  'district_representative',
  'district_secretary',
  'club_account',
  'club_admin',
  'president',
  'secretary',
  'treasurer',
] as const;

/** 会計操作権限があるか */
export function canManageFinance(role: string | null | undefined): boolean {
  if (!role) return false;
  return (FINANCE_MANAGER_ROLES as readonly string[]).includes(role);
}

/** クラブ運営操作権限があるか */
export function canManageClub(role: string | null | undefined): boolean {
  if (!role) return false;
  return (CLUB_MANAGER_ROLES as readonly string[]).includes(role);
}

/** 地区役員の役職（地区専用モードで使う） */
export const DISTRICT_OFFICER_ROLES = [
  'district_admin',
  'district_representative',
  'district_secretary',
  'district_treasurer',
  'district_pr_chair',
] as const;
export type DistrictOfficerRole = (typeof DISTRICT_OFFICER_ROLES)[number];

/** 地区役員（地区専用モードで表示する人）。system_owner は含めない */
export function isDistrictOfficer(role: string | null | undefined): boolean {
  return !!role && (DISTRICT_OFFICER_ROLES as readonly string[]).includes(role);
}

/** 地区管理画面を使えるロール（system_owner と地区役員）。useAuth の isDistrictStaff のサーバー版 */
export function isDistrictStaff(role: string | null | undefined): boolean {
  return role === 'system_owner' || isDistrictOfficer(role);
}

/** 地区役員アカウントの追加・役職変更ができるロール */
export function canManageDistrictOfficers(role: string | null | undefined): boolean {
  return role === 'system_owner' || role === 'district_admin' || role === 'district_representative';
}

/**
 * ロールを変更してよいか（権限昇格の防止）
 *  - system_owner はすべて可
 *  - district_admin は system_owner の付与・変更以外は可
 *  - 地区役員の付与・変更は canManageDistrictOfficers のロールのみ（地区管理者の付与は上の2つのみ）
 *  - それ以外は、地区系・上位ロールの付与も、上位ロールの人の変更もできない
 */
export function canAssignRole(
  actorRole: string | null | undefined,
  newRole: string | null | undefined,
  targetCurrentRole: string | null | undefined,
): boolean {
  if (actorRole === 'system_owner') return true;
  const high = (r: string | null | undefined) => r === 'system_owner' || r === 'district_admin';
  if (newRole === 'system_owner' || targetCurrentRole === 'system_owner') return false;
  if (actorRole === 'district_admin') return true;
  if (high(newRole) || high(targetCurrentRole)) return false;
  const districtish = (r: string | null | undefined) => isDistrictScope(r) || isDistrictOfficer(r);
  if (districtish(newRole) || districtish(targetCurrentRole)) return canManageDistrictOfficers(actorRole);
  return true;
}
