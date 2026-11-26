/**
 * 月カレンダーの共通処理（地区カレンダー・年間スケジュールで共用）
 *
 * サーバー・クライアントの両方から使うため、純粋な関数だけで構成する。
 * 日付は 'YYYY-MM-DD' の文字列で扱い、曜日は UTC で計算する（サーバーのタイムゾーンに左右されない）。
 */

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export type YearMonth = { y: number; m: number };

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM' */
export const monthKey = (y: number, m: number) => `${y}-${pad2(m)}`;

/** ?month=YYYY-MM を検証（不正なら today の月） */
export function parseMonth(v: string | string[] | undefined, today: string): YearMonth {
  if (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) {
    const y = Number(v.slice(0, 4));
    if (y >= 2000 && y <= 2100) return { y, m: Number(v.slice(5, 7)) };
  }
  return { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
}

/** diff か月ずらした年月 */
export function shiftMonth(y: number, m: number, diff: number): YearMonth {
  const idx = y * 12 + (m - 1) + diff;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** 曜日（0=日〜6=土） */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** その月の初日・末日・日数 */
export function monthRange(y: number, m: number): { start: string; end: string; daysInMonth: number } {
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${monthKey(y, m)}-01`,
    end: `${monthKey(y, m)}-${pad2(daysInMonth)}`,
    daysInMonth,
  };
}

/** カレンダーのマス（前月末の空白 + 当月 + 最終週の空白）。空白は null */
export function buildMonthCells(y: number, m: number): Array<string | null> {
  const { start, daysInMonth } = monthRange(y, m);
  const cells: Array<string | null> = [
    ...Array.from({ length: weekday(start) }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${monthKey(y, m)}-${pad2(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 'YYYY-MM-DD' として正しい日付か（2/30 などは不可） */
export function isValidDateString(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 曜日ごとの文字色（日=赤・土=青） */
export function weekdayTextClass(wd: number, fallback = 'text-gray-700'): string {
  return wd === 0 ? 'text-red-500' : wd === 6 ? 'text-blue-500' : fallback;
}
