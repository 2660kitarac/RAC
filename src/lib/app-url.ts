/**
 * 共有用URL（MU登録・申込フォーム・ログイン案内など）を組み立てるための本番アドレス
 *
 * 画面を開いているアドレス（window.location.origin）をそのまま使うと、
 * Vercel のプレビュー版（rac-cloud-git-…vercel.app など）から操作したときに
 * プレビュー版のURLが保存・共有されてしまう。プレビュー版は Vercel のログインが必要なため、
 * 外部の参加者は開けない。そこで共有用のURLは常に本番アドレスで組み立てる。
 *
 * 優先順位:
 *   1. 環境変数 NEXT_PUBLIC_APP_URL（独自ドメインに移ったときはここを設定する）
 *   2. 開いているアドレスが本番 or ローカル開発ならそのアドレス
 *   3. それ以外（Vercel のプレビュー版など）は本番アドレス
 *
 * クライアント・サーバーのどちらからも使える（'use client' なし・Node 専用 API なし）。
 */

/** 本番のアドレス（NEXT_PUBLIC_APP_URL が未設定のときに使う） */
export const PRODUCTION_ORIGIN = 'https://rac-cloud.vercel.app';

function stripSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

/** そのアドレスを共有用に使ってよいか（プレビュー版でないか） */
function isShareableOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) return true;
    // *.vercel.app は本番（rac-cloud.vercel.app）以外すべてプレビュー版とみなす
    if (hostname.endsWith('.vercel.app')) return hostname === new URL(PRODUCTION_ORIGIN).hostname;
    // 独自ドメインなど、それ以外は本番とみなす
    return true;
  } catch {
    return false;
  }
}

/**
 * 共有用のアドレスを返す。
 * @param currentOrigin いま開いているアドレス。省略時はブラウザなら window.location.origin
 */
export function shareOrigin(currentOrigin?: string | null): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && env.trim()) return stripSlash(env.trim());
  const origin = currentOrigin ?? (typeof window !== 'undefined' ? window.location.origin : null);
  if (origin && isShareableOrigin(origin)) return stripSlash(origin);
  return PRODUCTION_ORIGIN;
}

/** パス（/mu/xxx など）から共有用の絶対URLを作る */
export function shareUrl(path: string, currentOrigin?: string | null): string {
  return `${shareOrigin(currentOrigin)}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * 例会のMU登録URL。
 * 保存済みのURLはプレビュー版のアドレスのことがあるため、slug があれば必ず slug から作り直す。
 */
export function muRegistrationUrl(
  slug: string | null | undefined,
  storedUrl?: string | null,
  currentOrigin?: string | null,
): string | null {
  if (slug) return shareUrl(`/mu/${slug}`, currentOrigin);
  if (!storedUrl) return null;
  // slug がない古いデータ：このアプリのMU登録ページを指すURLだけ、アドレスを本番に差し替える
  // （外部のフォームなど、別サイトへのリンクはそのまま使う）
  try {
    const u = new URL(storedUrl);
    const isOurs = u.hostname.endsWith('.vercel.app') || u.pathname.startsWith('/mu/');
    return isOurs ? shareUrl(`${u.pathname}${u.search}`, currentOrigin) : storedUrl;
  } catch {
    return storedUrl;
  }
}
