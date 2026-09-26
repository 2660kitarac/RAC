/**
 * レジュメ用の表記ヘルパー（サーバー・クライアント共通）
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 'YYYY-MM-DD' を JST の暦日として解釈する（曜日ズレ防止のため UTC 正午で作る） */
function parseDate(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

/** 9月15日(月) */
export function formatMonthDayWeek(date: string, fullWidthParen = false): string {
  const d = parseDate(date);
  const w = WEEKDAYS[d.getUTCDay()];
  return fullWidthParen
    ? `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${w}）`
    : `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${w})`;
}

/** 例会日の月（1〜12） */
export function monthOf(date: string): number {
  return parseDate(date).getUTCMonth() + 1;
}

/** 7月始まりの年度表記: 2026-2027年度 */
export function fiscalYearLabel(date: string): string {
  const d = parseDate(date);
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() + 1 >= 7 ? y : y - 1;
  return `${start}-${start + 1}年度`;
}

/** 'HH:MM' → 分 */
function toMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 19:30ー20:30（60分） */
export function formatTimeRange(start?: string | null, end?: string | null): string {
  const s = start ? start.slice(0, 5) : '';
  const e = end ? end.slice(0, 5) : '';
  if (!s && !e) return '';
  if (!e) return s;
  const sm = toMinutes(start);
  const em = toMinutes(end);
  const dur = sm !== null && em !== null && em > sm ? `（${em - sm}分）` : '';
  return `${s}ー${e}${dur}`;
}

/** 本文中の【役職】行から役職だけを取り出す（MU登録フォームが note に入れている） */
export function extractPosition(note: string | null | undefined): string {
  if (!note) return '';
  const m = /【役職】\s*([^\n\r]+)/.exec(note);
  return m ? m[1].trim() : '';
}

/** 会員名簿の並び順に使う役職の優先度 */
const POSITION_RANK = ['会長', '直前会長', '会長エレクト', '副会長', '幹事', '副幹事', '会計', 'SAA'];

export function positionRank(position: string | null | undefined): number {
  if (!position) return 999;
  const p = position.trim();
  const exact = POSITION_RANK.indexOf(p);
  if (exact >= 0) return exact;
  // 「会長・○○」のような複合表記は先頭一致で拾う
  const prefix = POSITION_RANK.findIndex(r => p.startsWith(r));
  if (prefix >= 0) return prefix + 0.5;
  return 100;
}

/** 役職ラベルの色分け（参考レジュメに合わせる） */
export function positionTone(position: string): 'officer' | 'district' | 'chair' | 'plain' {
  if (!position) return 'plain';
  if (position.includes('地区')) return 'district';
  if (position.includes('委員長')) return 'chair';
  if (/会長|幹事|会計|広報|SAA|理事/.test(position)) return 'officer';
  return 'plain';
}

/** 地区区分の見出し（clubs.district に番号があれば「第2660地区」） */
export function districtHeading(district: string | null | undefined): string {
  const num = district ? /\d{3,4}/.exec(district)?.[0] : null;
  return num ? `第${num}地区` : '地区';
}
