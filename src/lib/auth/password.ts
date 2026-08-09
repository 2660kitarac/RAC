/**
 * パスワード関連の共通ロジック
 *
 * Server Component / API Route の両方から使えるように
 * 'use client' を持たない純粋関数のみで構成する。
 */

/** パスワードの最低文字数 */
export const PASSWORD_MIN_LENGTH = 8;

/** クラブ内の会員パスワードをリセットできるロール（自クラブ限定） */
const CLUB_PASSWORD_MANAGER_ROLES = [
  'club_account',
  'club_admin',
  'president',
  'secretary',
] as const;

/** 全クラブの会員パスワードをリセットできるロール */
const GLOBAL_PASSWORD_MANAGER_ROLES = [
  'system_owner',
  'district_admin',
  'district_representative',
  'district_secretary',
] as const;

export type PasswordActor = {
  id?: string | null;
  role?: string | null;
  clubId?: string | null;
} | null | undefined;

/** 自クラブ会員のパスワードをリセットする権限があるか */
export function canResetClubMemberPassword(role: string | null | undefined): boolean {
  if (!role) return false;
  return (CLUB_PASSWORD_MANAGER_ROLES as readonly string[]).includes(role);
}

/** 全クラブ横断でパスワードをリセットできるか */
export function canResetAnyPassword(role: string | null | undefined): boolean {
  if (!role) return false;
  return (GLOBAL_PASSWORD_MANAGER_ROLES as readonly string[]).includes(role);
}

/**
 * actor が target のパスワードをリセットできるか判定する。
 *
 * ルール:
 *  - 地区スタッフ（system_owner / district_admin 等）は全会員に対して可
 *  - クラブアカウント等は「自クラブに所属する会員」に対してのみ可
 *  - 上位ロール（system_owner / district_admin）のパスワードは
 *    クラブ側からはリセットできない（権限昇格の防止）
 */
export function canResetPasswordFor(
  actor: PasswordActor,
  target: { clubId?: string | null; role?: string | null; id?: string | null },
): { allowed: boolean; reason?: string } {
  const actorRole = actor?.role ?? null;
  const actorClubId = actor?.clubId ?? null;

  // 地区スタッフは全会員に対して可能
  if (canResetAnyPassword(actorRole)) {
    return { allowed: true };
  }

  // クラブ側の管理ロールでなければ不可
  if (!canResetClubMemberPassword(actorRole)) {
    return { allowed: false, reason: 'パスワードを変更する権限がありません' };
  }

  // 自クラブ所属でなければ不可
  if (!actorClubId || !target.clubId || actorClubId !== target.clubId) {
    return { allowed: false, reason: '他クラブの会員のパスワードは変更できません' };
  }

  // 上位ロールのパスワードはクラブ側から変更させない（権限昇格の防止）
  if (canResetAnyPassword(target.role)) {
    return { allowed: false, reason: 'このアカウントのパスワードは変更できません' };
  }

  return { allowed: true };
}

/**
 * パスワードの強度を検証する。
 * @returns エラーメッセージ（問題なければ null）
 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return '新しいパスワードを入力してください';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `パスワードは${PASSWORD_MIN_LENGTH}文字以上で設定してください`;
  }
  if (password.length > 128) {
    return 'パスワードは128文字以内で設定してください';
  }
  // 空白のみ・前後空白は事故につながるため弾く
  if (password.trim() !== password) {
    return 'パスワードの先頭・末尾に空白は使用できません';
  }
  // 英字と数字を各1文字以上（最低限の強度）
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'パスワードは英字と数字をそれぞれ1文字以上含めてください';
  }
  return null;
}

/**
 * ランダムな仮パスワードを生成する（クラブアカウントによる代理リセット用）。
 * 紛らわしい文字（0/O/1/l/I）を除外し、英字＋数字を必ず含める。
 */
export function generateTemporaryPassword(length = 10): string {
  const letters = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;

  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

  // 英字1文字・数字1文字を確保
  const chars = [pick(letters), pick(digits)];
  for (let i = chars.length; i < length; i++) {
    chars.push(pick(all));
  }

  // シャッフル（Fisher-Yates）
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
