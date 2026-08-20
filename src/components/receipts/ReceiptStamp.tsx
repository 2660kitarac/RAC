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

/** 印影テキストを丸印に収まるよう整形（最大8文字） */
function normalizeStampText(text: string): string[] {
  const t = text.replace(/\s+/g, '').slice(0, 8);
  if (t.length <= 2) return [t];
  if (t.length <= 4) return [t.slice(0, Math.ceil(t.length / 2)), t.slice(Math.ceil(t.length / 2))];
  // 5文字以上は3行に分割
  const per = Math.ceil(t.length / 3);
  return [t.slice(0, per), t.slice(per, per * 2), t.slice(per * 2)].filter(Boolean);
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
    const fontRatio = lines.length === 1 ? 0.34 : lines.length === 2 ? 0.26 : 0.2;
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
