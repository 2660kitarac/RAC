/**
 * クラブ→地区への提出物（報告書・Instagram投稿）で共通に使う定数・関数
 * クライアント／サーバーの両方から使えるよう、DB やサーバー専用モジュールは import しない
 */

// ------------------------------------------------------------
// 報告書（club_reports）
// ------------------------------------------------------------
export const REPORT_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<string, string> = {
  draft: '下書き',
  submitted: '審査待ち',
  approved: '承認済み',
  rejected: '差し戻し',
};

export const REPORT_TYPES = ['meeting', 'activity', 'other'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<string, string> = {
  meeting: '例会報告',
  activity: '活動報告',
  other: 'その他',
};

// ------------------------------------------------------------
// Instagram 投稿（instagram_posts）
// ------------------------------------------------------------
export const POST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_STATUS_LABELS: Record<string, string> = {
  pending: '審査待ち',
  approved: '承認済み',
  rejected: '差し戻し',
};

export const POST_TYPES = ['before', 'after', 'other'] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_TYPE_LABELS: Record<string, string> = {
  before: '投稿前告知',
  after: '活動報告',
  other: 'その他',
};

/** 承認時のスコア（表彰ポイント）の範囲 */
export const SCORE_MIN = 0;
export const SCORE_MAX = 10;
export const SCORE_DEFAULT = 5;

/** 入力の文字数上限 */
export const LIMITS = {
  title: 200,
  content: 20000,
  caption: 3000,
  postUrl: 1000,
  reason: 1000,
} as const;

/** バッジの色（tailwind クラス） */
export const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-amber-100 text-amber-800',
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// ------------------------------------------------------------
// 入力チェック
// ------------------------------------------------------------

/** 文字列を整える（前後の空白を除き、上限で切らずに null/文字列を返す） */
export function cleanText(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '';
}

/** http/https の URL なら URL オブジェクト、そうでなければ null */
export function parseHttpUrl(v: string | null | undefined): URL | null {
  if (!v) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** 画面にリンクとして表示して良い URL（http/https のみ）。不可なら null */
export function safeLink(v: string | null | undefined): string | null {
  const u = parseHttpUrl(v);
  return u ? u.toString() : null;
}

/** Instagram の URL かどうか（https://www.instagram.com/ または https://instagram.com/） */
export function isInstagramUrl(v: string | null | undefined): boolean {
  const u = parseHttpUrl(v);
  if (!u || u.protocol !== 'https:') return false;
  return u.hostname === 'www.instagram.com' || u.hostname === 'instagram.com';
}

/**
 * 投稿URLのチェック
 *  - https 以外 → エラー
 *  - Instagram 以外の https → 警告（保存は可能）
 */
export function checkPostUrl(v: string): { error?: string; warning?: string } {
  const s = v.trim();
  if (!s) return { error: '投稿URLを入力してください' };
  if (s.length > LIMITS.postUrl) return { error: `投稿URLは${LIMITS.postUrl}文字以内で入力してください` };
  const u = parseHttpUrl(s);
  if (!u || u.protocol !== 'https:') return { error: '投稿URLは https:// から始まるURLを入力してください' };
  if (!isInstagramUrl(s)) {
    return { warning: 'Instagram（https://www.instagram.com/…）以外のURLです。間違いがないか確認してください' };
  }
  return {};
}

/** スコアを 0〜10 の整数に。範囲外・数値でなければ null */
export function parseScore(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) return null;
  if (n < SCORE_MIN || n > SCORE_MAX) return null;
  return n;
}

export function isReportType(v: unknown): v is ReportType {
  return typeof v === 'string' && (REPORT_TYPES as readonly string[]).includes(v);
}

export function isPostType(v: unknown): v is PostType {
  return typeof v === 'string' && (POST_TYPES as readonly string[]).includes(v);
}

// ------------------------------------------------------------
// 表示
// ------------------------------------------------------------

/** 'YYYY-MM-DD HH:MM:SS' → 'YYYY/MM/DD HH:MM' */
export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '';
  return s.slice(0, 16).replace('T', ' ').replace(/-/g, '/');
}

/** 'YYYY-MM-DD…' → 'YYYY/MM/DD' */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  return s.slice(0, 10).replace(/-/g, '/');
}

/** 例会の表示名（2026/10/05 第12回 10月例会） */
export function meetingLabel(m: { date?: string | null; title?: string | null; meetingNumber?: number | null } | null | undefined): string {
  if (!m || (!m.date && !m.title)) return '';
  const no = m.meetingNumber ? `第${m.meetingNumber}回 ` : '';
  return `${fmtDate(m.date)} ${no}${m.title ?? ''}`.trim();
}

// ------------------------------------------------------------
// クラブ側の提出画面を使えるロール
// ------------------------------------------------------------
export const CLUB_SUBMITTER_ROLES = ['club_account', 'club_admin', 'president', 'secretary'] as const;

/** 提出画面を使えるか（system_owner / district_admin はクラブに所属している場合のみ） */
export function canSubmitToDistrict(role: string | null | undefined, clubId: string | null | undefined): boolean {
  if (!role || !clubId) return false;
  if ((CLUB_SUBMITTER_ROLES as readonly string[]).includes(role)) return true;
  return role === 'system_owner' || role === 'district_admin';
}
