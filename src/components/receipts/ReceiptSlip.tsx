/**
 * 領収書の共通レイアウト（印刷・画面プレビュー兼用）
 *
 * Server Component から使えるよう 'use client' を付けない（純表示）。
 *
 * 寸法はすべて CSS 変数 --u（印刷時 = 1mm）の倍数で指定する。
 * 画面プレビューでは --u を「表示幅 ÷ 190」にして、印刷と同じ見た目のまま縮小表示する。
 *
 * 1枚 = 190mm × 51mm。A4縦（上下8mm余白 → 281mm）に5枚 + 切り取り線4本（各5.5mm）＝277mm。
 * 各項目は枠内の決まった位置に置き、長い文字は省略して、枠からはみ出さないようにする。
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ 領 収 書                                   No. RAC-…        │
 *   │                                            2026年10月21日   │
 *   │ 〇〇ローターアクトクラブ                                      │
 *   │ 山田 太郎                     様                            │
 *   │ ┌金額─────────────────┐       ┌───────────────────┐ │
 *   │ │      ¥4,500－              │       │ 大阪北RAC        (印) │ │
 *   │ └───────────────────┘       │ 住所・TEL               │ │
 *   │ 但し 例会参加費として（11月例会）  └───────────────────┘ │
 *   │ 上記正に領収いたしました                                      │
 *   └────────────────────────────────────────────────────────────┘
 */
import ReceiptStamp, { type StampConfig } from './ReceiptStamp';
import { formatReceiptAmount, formatReceiptDate, receiptNameSize, receiptPurpose } from '@/lib/receipts/slip-format';

/**
 * 印刷・プレビューに使う領収書のデータ。
 * 取得する列は src/lib/receipts/print-columns.ts（receiptPrintColumns）にまとめてあり、
 * 項目を必須にしているので、列を取り忘れると型チェックで分かる（#42）。
 */
export interface ReceiptSlipData extends StampConfig {
  id?: string;
  receiptNumber: string;
  receiptName: string;
  /** 宛名側のクラブ名（MU参加者の所属クラブなど） */
  receiptClubName: string | null;
  amount: number;
  description: string | null;
  issuedDate: string | null;
  meetingTitle: string | null;
  /** 発行元クラブ */
  clubName: string | null;
  clubAddress: string | null;
  clubPhone: string | null;
}

export function ReceiptSlip({ receipt }: { receipt: ReceiptSlipData }) {
  const purpose = receiptPurpose(receipt.description, receipt.meetingTitle);
  return (
    <article className="rs-slip" aria-label={`領収書 ${receipt.receiptNumber}`}>
      <div className="rs-main">
        <h2 className="rs-title">領 収 書</h2>

        <div className="rs-to">
          {receipt.receiptClubName && <p className="rs-to-club rs-clip">{receipt.receiptClubName}</p>}
          {/* 宛名は省略しない。長いほど文字を小さくし、それでも長ければ2行まで折り返す */}
          <p className={`rs-to-name rs-name-${receiptNameSize(receipt.receiptName)}`}>
            <span className="rs-name-text">{receipt.receiptName}</span>
            <span className="rs-sama">様</span>
          </p>
        </div>

        <div className="rs-amount">
          <span className="rs-amount-label">金額</span>
          <span className="rs-amount-value">{formatReceiptAmount(receipt.amount)}<span className="rs-amount-dash">－</span></span>
        </div>

        {/* 但し書きは2行まで（それ以上は「…」） */}
        <p className="rs-purpose">
          <span className="rs-purpose-label">但し</span>
          {purpose}
        </p>
        <p className="rs-note">上記正に領収いたしました</p>
      </div>

      <div className="rs-side">
        <div className="rs-meta">
          <p className="rs-no rs-clip">No. {receipt.receiptNumber}</p>
          <p className="rs-date">{formatReceiptDate(receipt.issuedDate)}</p>
        </div>

        <div className="rs-issuer">
          <div className="rs-issuer-text">
            <p className="rs-issuer-name">{receipt.clubName}</p>
            {receipt.clubAddress && <p className="rs-issuer-sub rs-clip">{receipt.clubAddress}</p>}
            {receipt.clubPhone && <p className="rs-issuer-sub rs-clip">TEL {receipt.clubPhone}</p>}
          </div>
          <div className="rs-stamp">
            <ReceiptStamp stamp={receipt} size="calc(var(--u) * 15)" />
          </div>
        </div>
      </div>
    </article>
  );
}

/** 切り取り線（はさみ＋点線） */
function CutLine() {
  return (
    <div className="rs-cut" aria-hidden="true">
      <span className="rs-cut-mark">✂</span>
      <span className="rs-cut-line" />
    </div>
  );
}

/**
 * 印刷用：A4縦1ページに5枚ずつ並べ、間に切り取り線を入れる。
 * 画面では表示しない（.rs-print は印刷時のみ）。
 */
export function ReceiptPrintSheets({ receipts }: { receipts: ReceiptSlipData[] }) {
  const pages: ReceiptSlipData[][] = [];
  for (let i = 0; i < receipts.length; i += 5) pages.push(receipts.slice(i, i + 5));
  return (
    <div className="rs-print">
      {pages.map((page, p) => (
        <div key={p} className="rs-page">
          {page.map((r, i) => (
            // 領収書と下の切り取り線はページをまたがせない
            <div key={`${r.id ?? r.receiptNumber}-${i}`} className="rs-unit">
              <ReceiptSlip receipt={r} />
              {i < page.length - 1 && <CutLine />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 画面プレビュー：印刷と同じレイアウトを、表示幅に合わせて縮小して見せる */
export function ReceiptPreview({ receipt }: { receipt: ReceiptSlipData }) {
  return (
    <div className="rs-preview">
      <ReceiptSlip receipt={receipt} />
    </div>
  );
}

/** 領収書のスタイル（印刷ページに1回だけ置く） */
export function ReceiptStyles() {
  return <style>{RECEIPT_CSS}</style>;
}

const RECEIPT_CSS = `
.rs-slip {
  --ink: #1a1a1a;
  --sub: #5b5b5b;
  --rule: #1a1a1a;
  --accent: #b4142d;
  position: relative;
  box-sizing: border-box;
  width: calc(var(--u) * 190);
  height: calc(var(--u) * 51);
  padding: calc(var(--u) * 4) calc(var(--u) * 6) calc(var(--u) * 3.5);
  display: grid;
  grid-template-columns: 1fr calc(var(--u) * 62);
  grid-template-rows: minmax(0, 1fr);
  column-gap: calc(var(--u) * 7);
  overflow: hidden;
  background: #fff;
  color: var(--ink);
  border: calc(var(--u) * 0.25) solid #9a9a9a;
  font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif;
  font-size: calc(var(--u) * 2.9);
  line-height: 1.35;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* 詳細度0のリセット（各要素の margin 指定を打ち消さないように） */
:where(.rs-slip) :where(p, h2) { margin: 0; }
.rs-clip { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

/* 左：宛名・金額・但し書き */
.rs-main { min-width: 0; display: flex; flex-direction: column; }
.rs-title {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
  font-size: calc(var(--u) * 6.2);
  font-weight: 700;
  letter-spacing: 0.45em;
  line-height: 1;
}
.rs-to { margin-top: calc(var(--u) * 2); }
.rs-to-club { font-size: calc(var(--u) * 2.7); color: var(--sub); }
.rs-to-name {
  display: flex; align-items: baseline; gap: calc(var(--u) * 2);
  border-bottom: calc(var(--u) * 0.35) solid var(--rule);
  padding-bottom: calc(var(--u) * 0.6);
  font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
  font-size: calc(var(--u) * 5);
  font-weight: 700;
  line-height: 1.15;
}
.rs-name-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.rs-name-m { font-size: calc(var(--u) * 4); }
.rs-name-s { font-size: calc(var(--u) * 2.9); line-height: 1.1; }
.rs-name-s .rs-name-text { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rs-sama { flex: none; font-size: calc(var(--u) * 3.6); font-weight: 400; }

.rs-amount {
  margin-top: calc(var(--u) * 2);
  display: flex; align-items: center;
  border: calc(var(--u) * 0.35) solid var(--rule);
  height: calc(var(--u) * 8);
}
.rs-amount-label {
  flex: none; align-self: stretch; display: flex; align-items: center;
  padding: 0 calc(var(--u) * 3);
  background: #f1f1f1;
  border-right: calc(var(--u) * 0.25) solid var(--rule);
  font-size: calc(var(--u) * 3);
  letter-spacing: 0.3em;
}
.rs-amount-value {
  flex: 1; text-align: center;
  font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
  font-size: calc(var(--u) * 6.4);
  font-weight: 700;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rs-amount-dash { margin-left: calc(var(--u) * 0.5); }

.rs-purpose {
  flex: none; /* 縮めない（2行目が「上記正に〜」に隠れないように） */
  margin-top: calc(var(--u) * 1.5); font-size: calc(var(--u) * 3); line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.rs-purpose-label { margin-right: calc(var(--u) * 2.5); color: var(--sub); }
.rs-note { margin-top: auto; font-size: calc(var(--u) * 2.6); color: var(--sub); }

/* 右：番号・発行日・発行者と印 */
.rs-side { min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
.rs-meta { text-align: right; }
.rs-no { font-size: calc(var(--u) * 2.5); color: var(--sub); font-variant-numeric: tabular-nums; }
.rs-date { margin-top: calc(var(--u) * 0.8); font-size: calc(var(--u) * 3.3); font-variant-numeric: tabular-nums; }

.rs-issuer {
  position: relative;
  display: flex; align-items: center; gap: calc(var(--u) * 1.5);
  border-top: calc(var(--u) * 0.25) solid #b9b9b9;
  padding-top: calc(var(--u) * 2.2);
  min-height: calc(var(--u) * 16);
}
.rs-issuer-text { flex: 1; min-width: 0; }
.rs-issuer-name {
  font-size: calc(var(--u) * 3.3); font-weight: 700; line-height: 1.25;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.rs-issuer-sub { margin-top: calc(var(--u) * 0.5); font-size: calc(var(--u) * 2.4); color: var(--sub); }
.rs-stamp { flex: none; }

/* 切り取り線 */
.rs-cut {
  height: calc(var(--u) * 5.5);
  display: flex; align-items: center; gap: calc(var(--u) * 1.5);
  color: #9a9a9a;
}
.rs-cut-mark { font-size: calc(var(--u) * 3.2); line-height: 1; }
.rs-cut-line { flex: 1; border-top: calc(var(--u) * 0.35) dashed #8f8f8f; }

/* 画面プレビュー：表示幅に合わせて縮小（1mm = 幅 ÷ 190） */
.rs-preview { container-type: inline-size; width: 100%; overflow-x: auto; }
/* 小さい画面でも読めるよう 1mm = 2px より小さくしない（そのときは横にスクロール） */
.rs-preview .rs-slip { --u: max(calc(100cqw / 190), 2px); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
/* コンテナクエリの単位に対応していないブラウザ（古い Safari など） */
@supports not (width: 1cqw) { .rs-preview .rs-slip { --u: 3px; } }

/* 印刷 */
.rs-print { display: none; }
@page { size: A4 portrait; margin: 8mm 10mm; }
@media print {
  .rs-screen { display: none !important; }
  /* 単位は印刷部分全体で決める（切り取り線は .rs-slip の外にあるため。枠の中だけだと点線と高さが消える） */
  .rs-print { --u: 1mm; display: block !important; width: 190mm; margin: 0 auto; }
  .rs-print .rs-unit { break-inside: avoid; page-break-inside: avoid; }
  .rs-page + .rs-page { break-before: page; page-break-before: always; }
}
`;
