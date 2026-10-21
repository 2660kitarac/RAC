import { formatDate } from '@/lib/utils';
import ReceiptStamp, { type StampConfig } from '@/components/receipts/ReceiptStamp';

export interface ReceiptPrintData extends StampConfig {
  receiptNumber: string;
  receiptName: string;
  receiptClubName?: string | null;
  amount: number;
  description: string | null;
  issuedDate: string | null;
  meetingTitle?: string | null;
  clubName: string | null;
  clubAddress?: string | null;
  clubPhone?: string | null;
}

/** 領収書1枚の枠の高さ。5枚 + 切り取り線4本 = 276mm で、A4縦（上下余白8mm）の印刷可能高さ281mmに収まる */
const RECEIPT_SLIP_HEIGHT = '52mm';
/** 領収書間の切り取り線の高さ */
const RECEIPT_CUT_LINE_HEIGHT = '4mm';

/**
 * 印刷用の領収書1枚（枠 + 必要なら下の切り取り線）
 *
 * 1枚印刷・一括印刷の両方で使う。Server Component としても使えるよう
 * 'use client' を付けない（純表示）。印刷専用ブロック（.print-root）の中に置く。
 *
 * 枠の高さは固定。宛名のクラブ名あり・但し書き2行でも枠内に収まるよう
 * 行間と余白を詰めている（実測で最大約50mm）。項目や文字サイズを変えるときは
 * 高さを実測して確認すること。
 */
export function ReceiptPrintSlip({ receipt, withCutLine }: { receipt: ReceiptPrintData; withCutLine: boolean }) {
  return (
    <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
      <div style={{
        width: '190mm',
        height: RECEIPT_SLIP_HEIGHT,
        boxSizing: 'border-box',
        padding: '3mm 5mm',
        border: '0.5pt solid #999',
        background: 'white',
        // 想定外に長い内容でも、切り取り線や次の領収書に重ならないようにする
        overflow: 'hidden',
      }}>
        <ReceiptPrintContent receipt={receipt} />
      </div>
      {withCutLine && (
        <div style={{
          height: RECEIPT_CUT_LINE_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '6.5pt',
          color: '#aaa',
          lineHeight: 1,
          letterSpacing: 0,
        }}>
          ✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
        </div>
      )}
    </div>
  );
}

/** 領収書1枚の中身（190mm × 52mm の枠に収めるコンパクトレイアウト） */
function ReceiptPrintContent({ receipt }: { receipt: ReceiptPrintData }) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      fontSize: '8pt',
      lineHeight: 1.2,
      fontFamily: '"Hiragino Kaku Gothic ProN", "Meiryo", "Yu Gothic", sans-serif',
    }}>
      {/* ヘッダー行: タイトル + No */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5mm' }}>
        <div style={{ fontSize: '13pt', fontWeight: 'bold', letterSpacing: '4px' }}>領 収 書</div>
        <div style={{ fontSize: '7pt', color: '#666' }}>No. {receipt.receiptNumber}</div>
      </div>

      {/* 宛名 */}
      <div style={{ borderBottom: '1.5pt solid #000', paddingBottom: '0.5mm', marginBottom: '1mm' }}>
        {receipt.receiptClubName && (
          <div style={{ fontSize: '8pt', fontWeight: 'bold' }}>{receipt.receiptClubName}</div>
        )}
        <span style={{ fontSize: '11pt', fontWeight: 'bold' }}>{receipt.receiptName}</span>
        <span style={{ fontSize: '9pt' }}> 様</span>
      </div>

      {/* 金額 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2mm', marginBottom: '1mm' }}>
        <span style={{ fontSize: '7pt', color: '#666' }}>金額</span>
        <span style={{ fontSize: '14pt', fontWeight: 'bold' }}>
          ¥{receipt.amount.toLocaleString()} -
        </span>
      </div>

      {/* 但し書き */}
      {/* 3行以上になると発行日・印鑑が枠から押し出されるため、2行で打ち切る */}
      <div style={{ backgroundColor: '#f5f5f5', padding: '1mm 2mm', marginBottom: '1mm', borderRadius: '1mm' }}>
        <div style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
          <span style={{ fontSize: '7pt', color: '#666' }}>但し書き: </span>
          <span style={{ fontSize: '8pt' }}>{receipt.description}</span>
          {receipt.meetingTitle && (
            <span style={{ fontSize: '7pt', color: '#666' }}> （{receipt.meetingTitle}）</span>
          )}
        </div>
      </div>

      {/* フッター: 発行日 + クラブ名 + 印章 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
        <div>
          <span style={{ fontSize: '7pt', color: '#666' }}>発行日 </span>
          <span style={{ fontSize: '8pt' }}>{formatDate(receipt.issuedDate)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2mm' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 'bold', fontSize: '8pt' }}>{receipt.clubName}</div>
            {receipt.clubAddress && (
              <div style={{ fontSize: '6.5pt', color: '#666' }}>{receipt.clubAddress}</div>
            )}
            {receipt.clubPhone && (
              <div style={{ fontSize: '6.5pt', color: '#666' }}>TEL: {receipt.clubPhone}</div>
            )}
          </div>
          {/* 印章（電子印鑑） */}
          <ReceiptStamp stamp={receipt} size="11mm" />
        </div>
      </div>
    </div>
  );
}
