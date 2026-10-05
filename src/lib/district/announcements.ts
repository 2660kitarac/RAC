/**
 * 地区からのお知らせ（district_announcements）の共通定義
 *  - 表示用ラベル・色
 *  - 「いま掲載中か」の判定
 *  - 入力値の検証（API で使う）
 * サーバー・クライアントどちらからも使えるよう、純粋関数のみで構成する。
 */

export const ANNOUNCEMENT_LEVELS = ['info', 'important', 'urgent'] as const;
export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number];

export const ANNOUNCEMENT_AUDIENCES = ['all', 'officers'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_LEVEL_LABELS: Record<AnnouncementLevel, string> = {
  info: 'お知らせ',
  important: '重要',
  urgent: '緊急',
};

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: '全会員',
  officers: 'クラブ役員・クラブアカウントのみ',
};

/** 重要度ごとの色（Tailwind クラス） */
export const ANNOUNCEMENT_LEVEL_STYLES: Record<AnnouncementLevel, { box: string; badge: string; icon: string }> = {
  info: { box: 'border-indigo-200 bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700', icon: 'text-indigo-600' },
  important: { box: 'border-amber-200 bg-amber-50', badge: 'bg-amber-100 text-amber-800', icon: 'text-amber-600' },
  urgent: { box: 'border-red-200 bg-red-50', badge: 'bg-red-100 text-red-700', icon: 'text-red-600' },
};

/** 画面に渡すお知らせの形 */
export type AnnouncementView = {
  id: string;
  title: string;
  body: string;
  level: AnnouncementLevel;
  audience: AnnouncementAudience;
  linkUrl: string | null;
  linkLabel: string | null;
  publishFrom: string | null;
  publishUntil: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export function normalizeLevel(v: unknown): AnnouncementLevel {
  return (ANNOUNCEMENT_LEVELS as readonly string[]).includes(String(v)) ? (v as AnnouncementLevel) : 'info';
}

export function normalizeAudience(v: unknown): AnnouncementAudience {
  return (ANNOUNCEMENT_AUDIENCES as readonly string[]).includes(String(v)) ? (v as AnnouncementAudience) : 'all';
}

export type PublishState = 'published' | 'scheduled' | 'ended';

export const PUBLISH_STATE_LABELS: Record<PublishState, string> = {
  published: '掲載中',
  scheduled: '予約',
  ended: '終了',
};

/** 掲載状態（today は JST の YYYY-MM-DD） */
export function publishState(a: { publishFrom: string | null; publishUntil: string | null }, today: string): PublishState {
  if (a.publishFrom && a.publishFrom > today) return 'scheduled';
  if (a.publishUntil && a.publishUntil < today) return 'ended';
  return 'published';
}

/** いま掲載中か */
export function isCurrentlyPublished(a: { publishFrom: string | null; publishUntil: string | null }, today: string): boolean {
  return publishState(a, today) === 'published';
}

const LEVEL_ORDER: Record<AnnouncementLevel, number> = { urgent: 0, important: 1, info: 2 };

/** 表示順：固定 → 緊急 > 重要 > お知らせ → 新しい順 */
export function sortAnnouncements<T extends { pinned: boolean; level: string; publishFrom: string | null; createdAt: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const la = LEVEL_ORDER[normalizeLevel(a.level)];
    const lb = LEVEL_ORDER[normalizeLevel(b.level)];
    if (la !== lb) return la - lb;
    const da = a.publishFrom || a.createdAt;
    const db = b.publishFrom || b.createdAt;
    return db.localeCompare(da);
  });
}

/** http / https の URL のみ許可する（それ以外は null） */
export function safeHttpUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 1000) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateOrNull(v: unknown): string | null {
  return typeof v === 'string' && DATE_RE.test(v) ? v : null;
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '';
}

export const ANNOUNCEMENT_LIMITS = { title: 100, body: 5000, linkLabel: 50 } as const;

export type AnnouncementInput = {
  title: string;
  body: string;
  level: AnnouncementLevel;
  audience: AnnouncementAudience;
  linkUrl: string | null;
  linkLabel: string | null;
  publishFrom: string | null;
  publishUntil: string | null;
  pinned: boolean;
};

/**
 * 入力値を検証して整える。問題があれば { error } を返す。
 */
export function sanitizeAnnouncementInput(raw: unknown): { ok: true; value: AnnouncementInput } | { ok: false; error: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = text(b.title, ANNOUNCEMENT_LIMITS.title + 1);
  if (!title) return { ok: false, error: 'タイトルを入力してください' };
  if (title.length > ANNOUNCEMENT_LIMITS.title) return { ok: false, error: `タイトルは${ANNOUNCEMENT_LIMITS.title}文字以内で入力してください` };
  const body = text(b.body, ANNOUNCEMENT_LIMITS.body + 1);
  if (body.length > ANNOUNCEMENT_LIMITS.body) return { ok: false, error: `本文は${ANNOUNCEMENT_LIMITS.body}文字以内で入力してください` };

  const rawUrl = typeof b.linkUrl === 'string' ? b.linkUrl.trim() : '';
  const linkUrl = rawUrl ? safeHttpUrl(rawUrl) : null;
  if (rawUrl && !linkUrl) return { ok: false, error: 'リンクは http:// または https:// で始まるURLを入力してください' };
  const linkLabel = linkUrl ? text(b.linkLabel, ANNOUNCEMENT_LIMITS.linkLabel) || null : null;

  const publishFrom = dateOrNull(b.publishFrom);
  const publishUntil = dateOrNull(b.publishUntil);
  if (publishFrom && publishUntil && publishUntil < publishFrom) {
    return { ok: false, error: '掲載終了日は掲載開始日より後の日付にしてください' };
  }

  return {
    ok: true,
    value: {
      title,
      body,
      level: normalizeLevel(b.level),
      audience: normalizeAudience(b.audience),
      linkUrl,
      linkLabel,
      publishFrom,
      publishUntil,
      pinned: b.pinned === true,
    },
  };
}

/** DB 行 → 画面用 */
export function toAnnouncementView(r: {
  id: string; title: string; body: string; level: string; audience: string;
  linkUrl: string | null; linkLabel: string | null; publishFrom: string | null; publishUntil: string | null;
  pinned: boolean; createdAt: string; updatedAt: string;
}): AnnouncementView {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    level: normalizeLevel(r.level),
    audience: normalizeAudience(r.audience),
    // 表示時にも念のため http/https 以外は捨てる
    linkUrl: safeHttpUrl(r.linkUrl),
    linkLabel: r.linkLabel,
    publishFrom: r.publishFrom,
    publishUntil: r.publishUntil,
    pinned: r.pinned,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
