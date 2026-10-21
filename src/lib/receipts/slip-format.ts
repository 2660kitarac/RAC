/**
 * 領収書の表示用の整形（ReceiptSlip で使う。テストしやすいよう純粋な関数だけにする）
 */

/** 2026-10-21 → 2026年10月21日（タイムゾーンの影響を受けないよう文字列から作る） */
export function formatReceiptDate(ymd: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  if (!m) return ymd || '';
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

/**
 * 金額。保存されている値をそのまま出す（マイナスもそのまま表示して、誤りに気付けるようにする）。
 * src/lib/utils の formatCurrency と違い、領収書の金額欄向けに「¥」と桁区切りだけにする。
 */
export function formatReceiptAmount(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return `${v < 0 ? '-' : ''}¥${Math.abs(v).toLocaleString('ja-JP')}`;
}

/**
 * 但し書きの本文。
 *  - 「として」で終わっていなければ付ける（一括発行の但し書きは「〜として」で保存されている）
 *  - 例会名が但し書きに含まれていなければ後ろに添える（二重括弧にしない）
 *   例：「例会参加費」＋「11月第2例会（第1397回）」→「例会参加費として　11月第2例会（第1397回）」
 *       「11月例会 参加費として」＋「11月例会」→「11月例会 参加費として」
 */
export function receiptPurpose(description: string | null, meetingTitle: string | null): string {
  const d = (description ?? '').trim();
  const t = (meetingTitle ?? '').trim();
  const parts: string[] = [];
  if (d) parts.push(d.endsWith('として') ? d : `${d}として`);
  if (t && !d.includes(t)) parts.push(t);
  return parts.join('　');
}

/** 文字の見た目の幅（全角=1、英数字・記号の半角=0.6） */
function visualWidth(text: string): number {
  return Array.from(text).reduce((n, c) => n + (/[\x20-\x7e]/.test(c) ? 0.6 : 1), 0);
}

/**
 * 宛名の文字の大きさ。正式な領収書なので宛名は省略せず、長いほど小さくして収める。
 *  - l：20文字分まで（通常）／ m：26文字分まで／ s：それより長い（2行まで折り返す）
 */
export function receiptNameSize(name: string): 'l' | 'm' | 's' {
  const w = visualWidth(name);
  if (w <= 20) return 'l';
  if (w <= 26) return 'm';
  return 's';
}
