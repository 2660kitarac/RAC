/**
 * 地区役員画面で使う表示用の関数（サーバー・クライアントどちらからも使える）
 */

/** 金額の表示（例：12,000円） */
export function yen(n: number | null | undefined): string {
  return `${(n ?? 0).toLocaleString('ja-JP')}円`;
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

/** 日付の表示（例：2026/10/05（月）） */
export function formatYmd(d: string | null | undefined, withWeek = true): string {
  if (!d) return '—';
  const ymd = d.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return d;
  const base = ymd.replace(/-/g, '/');
  if (!withWeek) return base;
  const w = WEEK[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
  return `${base}（${w}）`;
}

/** 短い日付の表示（例：10/5（月）） */
export function formatMd(d: string | null | undefined): string {
  if (!d) return '—';
  const ymd = d.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return d;
  const w = WEEK[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}（${w}）`;
}

/** 割合（0〜100） */
export function percent(part: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0;
}
