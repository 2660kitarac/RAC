import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import PrintToolbar from '@/components/receipts/PrintToolbar';
import ReceiptStamp from '@/components/receipts/ReceiptStamp';

export const metadata = { title: '領収書 一括印刷' };

/**
 * 一括印刷ページ
 * URL: /receipts/bulk-print?ids=id1,id2,id3
 *
 * A4縦に1列で領収書を並べる（1枚あたり約54mm）。
 * 5枚ごとに1ページに収まるよう設定。
 * ブラウザの印刷機能でPDF保存も可。
 */
export default async function BulkPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; meetingId?: string; fiscalYear?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const params = await searchParams;
  const db = await getDbFromContext();

  const clubId = session.user.clubId;

  let receiptList: any[] = [];

  if (params.ids) {
    // IDリストで直接指定
    const ids = params.ids.split(',').filter(Boolean);
    if (ids.length > 0) {
      const conditions = clubId
        ? and(inArray(receipts.id, ids), eq(receipts.clubId, clubId), eq(receipts.status, 'issued'), isNull(receipts.deletedAt))
        : and(inArray(receipts.id, ids), eq(receipts.status, 'issued'), isNull(receipts.deletedAt));

      receiptList = await db
        .select({
          id: receipts.id,
          receiptNumber: receipts.receiptNumber,
          receiptName: receipts.receiptName,
          amount: receipts.amount,
          description: receipts.description,
          issuedDate: receipts.issuedDate,
          meetingTitle: meetings.title,
          clubName: clubs.name,
          clubAddress: clubs.address,
          clubPhone: clubs.phone,
          stampImageUrl: clubs.stampImageUrl,
          stampText: clubs.stampText,
          stampEnabled: clubs.stampEnabled,
        })
        .from(receipts)
        .leftJoin(meetings, eq(receipts.meetingId, meetings.id))
        .leftJoin(clubs, eq(receipts.clubId, clubs.id))
        .where(conditions);
    }
  } else if (params.meetingId && clubId) {
    // 例会IDで発行済み領収書を取得
    receiptList = await db
      .select({
        id: receipts.id,
        receiptNumber: receipts.receiptNumber,
        receiptName: receipts.receiptName,
        amount: receipts.amount,
        description: receipts.description,
        issuedDate: receipts.issuedDate,
        meetingTitle: meetings.title,
        clubName: clubs.name,
        clubAddress: clubs.address,
        clubPhone: clubs.phone,
        stampImageUrl: clubs.stampImageUrl,
        stampText: clubs.stampText,
        stampEnabled: clubs.stampEnabled,
      })
      .from(receipts)
      .leftJoin(meetings, eq(receipts.meetingId, meetings.id))
      .leftJoin(clubs, eq(receipts.clubId, clubs.id))
      .where(and(
        eq(receipts.meetingId, params.meetingId),
        eq(receipts.clubId, clubId),
        eq(receipts.status, 'issued'),
        isNull(receipts.deletedAt),
      ));
  } else if (params.fiscalYear && clubId) {
    // 年会費で絞り込み（但し書きに年度が含まれるもの）
    receiptList = await db
      .select({
        id: receipts.id,
        receiptNumber: receipts.receiptNumber,
        receiptName: receipts.receiptName,
        amount: receipts.amount,
        description: receipts.description,
        issuedDate: receipts.issuedDate,
        meetingTitle: meetings.title,
        clubName: clubs.name,
        clubAddress: clubs.address,
        clubPhone: clubs.phone,
        stampImageUrl: clubs.stampImageUrl,
        stampText: clubs.stampText,
        stampEnabled: clubs.stampEnabled,
      })
      .from(receipts)
      .leftJoin(meetings, eq(receipts.meetingId, meetings.id))
      .leftJoin(clubs, eq(receipts.clubId, clubs.id))
      .where(and(
        eq(receipts.clubId, clubId),
        eq(receipts.status, 'issued'),
        isNull(receipts.deletedAt),
      ))
      .then((rows: any[]) =>
        rows.filter(r => r.description?.includes('年会費') && r.description?.includes(params.fiscalYear!))
      );
  }

  // A4縦に5枚ずつページ分割
  const RECEIPTS_PER_PAGE = 5;
  const pages: any[][] = [];
  for (let i = 0; i < receiptList.length; i += RECEIPTS_PER_PAGE) {
    pages.push(receiptList.slice(i, i + RECEIPTS_PER_PAGE));
  }

  return (
    <div className="min-h-screen bg-gray-100 print:min-h-0 print:bg-white">
      {/* 操作バー（印刷時非表示 / Client Component） */}
      <PrintToolbar
        backHref="/receipts"
        note={`${receiptList.length}件の領収書（A4縦・1ページに5枚）`}
        printLabel="全件印刷 / PDF保存"
        sticky
        maxWidthClass="max-w-3xl"
      />

      {receiptList.length === 0 ? (
        <div className="screen-only flex items-center justify-center min-h-64">
          <div className="text-center text-gray-400">
            <p className="text-lg">印刷する領収書がありません</p>
            <p className="text-sm mt-1">一括発行後にこのページを開いてください</p>
          </div>
        </div>
      ) : (
        <>
          {/* 画面プレビュー（印刷時非表示） */}
          <div className="screen-only max-w-3xl mx-auto p-6 space-y-3">
            <div className="text-sm text-gray-500 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              📄 印刷時はA4縦1枚に5枚ずつ並んで出力されます
            </div>
            {receiptList.map((receipt) => (
              <ReceiptCardScreen key={receipt.id} receipt={receipt} />
            ))}
          </div>

          {/* 印刷用レイアウト（画面では非表示・印刷時のみ） */}
          <div className="print-root">
            {pages.map((pageReceipts, pageIndex) => (
              <div key={pageIndex} className="print-page">
                {pageReceipts.map((receipt, slipIndex) => (
                  <div key={receipt.id} className="receipt-slip-wrapper">
                    <div className="receipt-slip-print">
                      <ReceiptPrintContent receipt={receipt} />
                    </div>
                    {/* 切り取り線（最後の1枚以外） */}
                    {slipIndex < pageReceipts.length - 1 && (
                      <div className="cut-line-print">
                        ✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        /* ===== 印刷設定 ===== */
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }

        /* 画面表示時：印刷専用ブロックを隠す */
        .print-root {
          display: none;
        }

        @media print {
          /* 画面専用要素を隠す */
          .screen-only {
            display: none !important;
          }

          /* 印刷専用ブロックを表示 */
          .print-root {
            display: block !important;
            width: 190mm;
            margin: 0 auto;
          }

          /* 1ページ＝領収書5枚分。高さ固定しない（先頭見切れ防止） */
          .print-page {
            width: 190mm;
            display: block;
            overflow: visible;
          }

          /* 2ページ目以降の先頭で改ページ */
          .print-page + .print-page {
            page-break-before: always;
            break-before: page;
          }

          /* 1枚のラッパー（領収書 + 切り取り線） */
          .receipt-slip-wrapper {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          /* 領収書本体: 1枚 = 48mm */
          .receipt-slip-print {
            width: 190mm;
            height: 48mm;
            box-sizing: border-box;
            padding: 3mm 5mm;
            border: 0.5pt solid #aaa;
            background: white;
            page-break-inside: avoid;
            break-inside: avoid;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }

          /* 切り取り線: 5mm */
          .cut-line-print {
            height: 5mm;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 6.5pt;
            color: #aaa;
            letter-spacing: 0;
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

/** 画面表示用カード */
function ReceiptCardScreen({ receipt }: { receipt: any }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs text-gray-400">No. {receipt.receiptNumber}</p>
          <p className="text-lg font-bold text-gray-900">{receipt.receiptName} 様</p>
        </div>
        <p className="text-2xl font-bold text-gray-900">¥{receipt.amount.toLocaleString()}</p>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          <span className="text-xs text-gray-400 mr-1">但し書き:</span>
          {receipt.description}
          {receipt.meetingTitle && <span className="text-xs text-gray-400 ml-1">（{receipt.meetingTitle}）</span>}
        </div>
        <div className="text-right text-xs text-gray-400">
          {formatDate(receipt.issuedDate)} / {receipt.clubName}
        </div>
      </div>
    </div>
  );
}

/** 印刷用コンパクトレイアウト（1枚 48mm × 190mm に収める） */
function ReceiptPrintContent({ receipt }: { receipt: any }) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      fontSize: '8pt',
      fontFamily: '"Hiragino Kaku Gothic ProN", "Meiryo", "Yu Gothic", sans-serif',
    }}>
      {/* ヘッダー行: タイトル + No */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1mm' }}>
        <div style={{ fontSize: '13pt', fontWeight: 'bold', letterSpacing: '4px' }}>領 収 書</div>
        <div style={{ fontSize: '7pt', color: '#666' }}>No. {receipt.receiptNumber}</div>
      </div>

      {/* 宛名 */}
      <div style={{ borderBottom: '1.5pt solid #000', paddingBottom: '1mm', marginBottom: '1.5mm' }}>
        <span style={{ fontSize: '11pt', fontWeight: 'bold' }}>{receipt.receiptName}</span>
        <span style={{ fontSize: '9pt' }}> 様</span>
      </div>

      {/* 金額 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2mm', marginBottom: '1.5mm' }}>
        <span style={{ fontSize: '7pt', color: '#666' }}>金額</span>
        <span style={{ fontSize: '14pt', fontWeight: 'bold' }}>
          ¥{receipt.amount.toLocaleString()} -
        </span>
      </div>

      {/* 但し書き */}
      <div style={{ backgroundColor: '#f5f5f5', padding: '1.5mm 2mm', marginBottom: '1.5mm', borderRadius: '1mm' }}>
        <span style={{ fontSize: '7pt', color: '#666' }}>但し書き: </span>
        <span style={{ fontSize: '8pt' }}>{receipt.description}</span>
        {receipt.meetingTitle && (
          <span style={{ fontSize: '7pt', color: '#666' }}> （{receipt.meetingTitle}）</span>
        )}
      </div>

      {/* フッター: 発行日 + クラブ名 + 印章 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
        <div>
          <div style={{ fontSize: '7pt', color: '#666' }}>発行日</div>
          <div style={{ fontSize: '8pt' }}>{formatDate(receipt.issuedDate)}</div>
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
