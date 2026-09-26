/**
 * 出席登録が「自クラブの会員」かどうかの判定（サーバー・画面の共通ロジック）
 *
 * 自クラブの会員が MU 登録フォームから登録すると、registration_type は 'mu' になる。
 * また、ログインせずに登録すると user_id が空になる。
 * そのため「MU登録かどうか」ではなく、所属クラブで判定する。
 */

/** 氏名の比較用：全角・半角の空白を除き、表記ゆれを揃える */
export function normalizePersonName(name: string | null | undefined): string {
  return (name ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
}

/** クラブ名の比較用：空白を除き「ローターアクトクラブ」→RAC、「ロータリークラブ」→RC に揃える */
export function normalizeClubName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/ローターアクトクラブ/g, 'RAC')
    .replace(/ロータリークラブ/g, 'RC')
    .toUpperCase();
}

export interface OwnClubContext {
  id: string;
  name?: string | null;
  shortName?: string | null;
}

export interface AttendanceClubInfo {
  userId?: string | null;
  /** 会員アカウントの所属クラブ（users.club_id） */
  userClubId?: string | null;
  /** 登録時に選ばれた所属クラブ（attendances.club_id） */
  clubId?: string | null;
  /** 登録時に入力・選択された所属クラブ名（attendances.club_name） */
  clubName?: string | null;
}

/** 自クラブの会員の登録か */
export function isOwnClubAttendance(a: AttendanceClubInfo, club: OwnClubContext): boolean {
  // 1. 会員アカウントでの登録：アカウントの所属クラブで決める
  if (a.userId && a.userClubId) return a.userClubId === club.id;
  // 2. 登録時に所属クラブが選ばれている
  if (a.clubId) return a.clubId === club.id;
  // 3. クラブ名の手入力だけのとき：名前で照合する
  const n = normalizeClubName(a.clubName);
  if (!n) return false;
  return [club.name, club.shortName].some(c => c && normalizeClubName(c) === n);
}

/**
 * 一覧の「所属」欄に出すクラブ名
 * 自クラブの会員は登録経路にかかわらず同じ表記（略称があれば略称）にそろえる。
 * 他クラブは登録時のクラブ名 → 会員アカウントの所属クラブ名の順に使う。
 */
export function displayAffiliation(
  a: AttendanceClubInfo & { userClubName?: string | null; userClubShortName?: string | null },
  club: OwnClubContext,
): string {
  if (isOwnClubAttendance(a, club)) return (club.shortName || club.name || '').trim();
  return (a.clubName?.trim() || a.userClubShortName || a.userClubName || '').trim();
}
