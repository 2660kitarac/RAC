/**
 * 領収書用 電子印鑑
 *
 * Server Component としても使えるよう 'use client' を付けない（純表示）。
 *
 * 表示優先順位:
 *   1. stampImageUrl がある → 画像を表示（印影スキャン画像など）
 *   2. stampText がある     → 朱色の丸印を CSS で自動生成
 *   3. どちらも無い         → グレーの「印」枠（従来どおり）
 *
 * stampEnabled が false の場合は常に空枠を表示する。
 */

export interface StampConfig {
  stampImageUrl?: string | null;
  stampText?: string | null;
  stampEnabled?: boolean | null;
}

interface ReceiptStampProps {
  stamp?: StampConfig | null;
  /** 印影のサイズ（CSS 単位つき文字列。印刷時は mm 推奨） */
  size?: string;
}

/**
 * 印影テキストを丸印に収まるよう行に分ける（最大8文字）
 * 英数字のまとまり（RAC など）は途中で改行しない。
 *   例：大阪北RAC → 大阪北 / RAC、池田くれはRAC → 池田 / くれは / RAC
 */
export function normalizeStampText(text: string): string[] {
  // 絵文字などで文字が途中で切れないよう、コードポイント単位で数える
  const t = Array.from(text.replace(/\s+/gu, '')).slice(0, 8).join('');
  const tokens = t.match(/[A-Za-z0-9]+|[^A-Za-z0-9]/gu) ?? [];
  // 英数字は幅が狭いので 0.6 文字分として数える
  const width = (tok: string) => (/^[A-Za-z0-9]+$/.test(tok) ? tok.length * 0.6 : 1);
  const total = tokens.reduce((n, tok) => n + width(tok), 0);
  const lineCount = total <= 2.5 ? 1 : total <= 5 ? 2 : 3;
  if (lineCount === 1) return [t];

  // 英数字のまとまりは独立した行にし、残りの漢字・かなを残りの行に均等に割り振る
  const asciiIdx = tokens.findIndex(tok => /^[A-Za-z0-9]+$/.test(tok));
  const lines: string[] = [];
  if (asciiIdx >= 0 && asciiIdx === tokens.length - 1 && tokens.length > 1) {
    const kanji = tokens.slice(0, -1).join('');
    const rest = lineCount - 1;
    if (rest === 2 && kanji.length > 1) {
      // 2行に分けるときは、漢字とかなの切れ目など読みやすい位置で分ける（池田くれは → 池田 / くれは）
      const script = (c: string) => (/[\u3040-\u309f]/.test(c) ? 'h' : /[\u30a0-\u30ff]/.test(c) ? 'k' : 'c');
      const chars = Array.from(kanji);
      let best = Math.ceil(chars.length / 2);
      let bestCost = Infinity;
      for (let i = 1; i < chars.length; i++) {
        const cost = Math.max(i, chars.length - i) + (script(chars[i - 1]) === script(chars[i]) ? 0.5 : 0);
        if (cost < bestCost) { bestCost = cost; best = i; }
      }
      lines.push(chars.slice(0, best).join(''), chars.slice(best).join(''));
    } else {
      // コードポイント単位で分ける（サロゲートペアの文字を途中で切らない）
      const chars = Array.from(kanji);
      const per = Math.ceil(chars.length / rest);
      for (let i = 0; i < chars.length; i += per) lines.push(chars.slice(i, i + per).join(''));
    }
    lines.push(tokens[tokens.length - 1]);
    return lines;
  }
  const per = Math.ceil(total / lineCount);
  let cur = '';
  let curW = 0;
  for (const tok of tokens) {
    if (curW + width(tok) > per && cur) { lines.push(cur); cur = ''; curW = 0; }
    cur += tok; curW += width(tok);
  }
  if (cur) lines.push(cur);
  // 丸に収まるのは3行まで。超えたら最後の行にまとめる
  while (lines.length > 3) {
    const last = lines.pop()!;
    lines[lines.length - 1] += last;
  }
  return lines;
}

export default function ReceiptStamp({ stamp, size = '16mm' }: ReceiptStampProps) {
  const enabled = !!stamp?.stampEnabled;
  const imageUrl = enabled ? stamp?.stampImageUrl : null;
  const text = enabled ? stamp?.stampText : null;

  // 1. 画像印影
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt="印"
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          flexShrink: 0,
        }}
      />
    );
  }

  // 2. テキストから丸印を自動生成
  if (text && text.trim()) {
    const lines = normalizeStampText(text);
    // 行数に応じて文字サイズを調整（size に対する相対値）
    // 一番長い行が丸に収まるよう文字の大きさを決める（英数字は細いので0.6文字分）
    const longest = Math.max(...lines.map(l => Array.from(l).reduce((n, c) => n + (/[A-Za-z0-9]/.test(c) ? 0.6 : 1), 0)));
    const byLines = lines.length === 1 ? 0.34 : lines.length === 2 ? 0.27 : 0.21;
    const fontRatio = Math.min(byLines, 0.62 / Math.max(longest, 1));
    return (
      <div
        style={{
          width: size,
          height: size,
          border: `calc(${size} * 0.07) solid #c8102e`,
          borderRadius: '50%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#c8102e',
          fontWeight: 'bold',
          lineHeight: 1.05,
          letterSpacing: '0.02em',
          flexShrink: 0,
          boxSizing: 'border-box',
          fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif',
          overflow: 'hidden',
          // 印刷時に色が飛ばないようにする
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        {lines.map((line, i) => (
          <span key={i} style={{ fontSize: `calc(${size} * ${fontRatio})`, whiteSpace: 'nowrap' }}>
            {line}
          </span>
        ))}
      </div>
    );
  }

  // 3. 未設定 → 空枠
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `calc(${size} * 0.05) solid #ccc`,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `calc(${size} * 0.3)`,
        color: '#ccc',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      印
    </div>
  );
}
