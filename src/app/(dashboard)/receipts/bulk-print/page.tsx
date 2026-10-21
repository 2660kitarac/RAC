import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import PrintToolbar from '@/components/receipts/PrintToolbar';
import { ReceiptPrintSlip } from '@/components/receipts/ReceiptPrintSlip';
import { isDistrictScope, canManageFinance } from '@/lib/auth/tenant';

export const metadata = { title: '領収書 一括印刷' };

/**
 * 一括印刷ページ
 * URL: /receipts/bulk-print?ids=id1,id2,id3
 *
 * A4縦に1列で領収書を並べる（1枚52mm + 切り取り線4mm）。
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

  // 印刷できる範囲（canPrintReceipt と同じルール。IDOR 対策）
  //  - 会計権限のロールのみ。それ以外は何も印刷しない
  //  - 地区スタッフはクラブ横断可（clubScope = undefined）
  //  - それ以外は自クラブのみ。クラブ未所属なら何も印刷しない
  const districtScope = isDistrictScope(session.user.role);
  const canQuery = canManageFinance(session.user.role) && (districtScope || !!clubId);
  const clubScope = districtScope || !clubId ? undefined : eq(receipts.clubId, clubId);

  let receiptList: any[] = [];

  if (params.ids && canQuery) {
    // IDリストで直接指定
    const ids = params.ids.split(',').filter(Boolean);
    if (ids.length > 0) {
      const conditions = and(inArray(receipts.id, ids), clubScope, eq(receipts.status, 'issued'), isNull(receipts.deletedAt));

      receiptList = await db
        .select({
          id: receipts.id,
          receiptNumber: receipts.receiptNumber,
          receiptName: receipts.receiptName,
          receiptClubName: receipts.receiptClubName,
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
  } else if (params.meetingId && canQuery) {
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
        clubScope,
        eq(receipts.status, 'issued'),
        isNull(receipts.deletedAt),
      ));
  } else if (params.fiscalYear && clubId && canQuery) {
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
                  <ReceiptPrintSlip
                    key={receipt.id}
                    receipt={receipt}
                    withCutLine={slipIndex < pageReceipts.length - 1}
                  />
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
          {receipt.receiptClubName && (
            <p className="text-sm font-bold text-gray-700">{receipt.receiptClubName}</p>
          )}
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
