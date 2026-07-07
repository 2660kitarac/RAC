import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { formatDate } from '@/lib/utils';

export const metadata = { title: '領収書 一括印刷' };

/**
 * 一括印刷ページ
 * URL: /receipts/bulk-print?ids=id1,id2,id3
 *
 * A4用紙に2列×複数行でレイアウト。
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
        })
        .from(receipts)
        .leftJoin(meetings, eq(receipts.meetingId, meetings.id))
        .leftJoin(clubs, eq(receipts.clubId, clubs.id))
        .where(conditions);
    }
  } else if (params.meetingId && clubId) {
    // 例会IDで外部参加者の発行済み領収書を取得
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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 操作バー（印刷時非表示） */}
      <div className="print:hidden bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.history.back()}
              className="text-gray-600 text-sm hover:text-gray-900 flex items-center gap-1"
            >
              ← 戻る
            </button>
            <span className="text-gray-500 text-sm">
              {receiptList.length}件の領収書
            </span>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow"
          >
            🖨️ 全件印刷 / PDF保存
          </button>
        </div>
      </div>

      {receiptList.length === 0 ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="text-center text-gray-400">
            <p className="text-lg">印刷する領収書がありません</p>
            <p className="text-sm mt-1">一括発行後にこのページを開いてください</p>
          </div>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto p-6 print:p-0 print:max-w-none">
          {/* 2列グリッドで領収書を並べる */}
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-6 print:gap-0"
            style={{ printColorAdjust: 'exact' } as React.CSSProperties}
          >
            {receiptList.map((receipt, index) => (
              <div
                key={receipt.id}
                className="print:break-inside-avoid"
                style={index > 0 && index % 2 === 0 ? { pageBreakBefore: 'always' } : undefined}
              >
                <ReceiptCard receipt={receipt} />
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @page {
          size: A4;
          margin: 10mm;
        }
        @media print {
          body { background: white; margin: 0; }
          .print\\:hidden { display: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:gap-0 { gap: 0 !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .print\\:max-w-none { max-width: none !important; }
        }
      `}</style>
    </div>
  );
}

function ReceiptCard({ receipt }: { receipt: any }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm print:shadow-none print:rounded-none print:border print:border-gray-300 print:m-1">
      {/* タイトル */}
      <h2 className="text-2xl font-bold text-center text-gray-900 mb-0.5 tracking-widest">領 収 書</h2>
      <p className="text-center text-xs text-gray-400 mb-4">No. {receipt.receiptNumber}</p>

      {/* 宛名 */}
      <div className="border-b-2 border-gray-800 pb-1.5 mb-4">
        <p className="text-lg font-bold text-gray-900">{receipt.receiptName} 様</p>
      </div>

      {/* 金額 */}
      <div className="text-center mb-4">
        <p className="text-xs text-gray-500 mb-0.5">金額</p>
        <p className="text-3xl font-bold text-gray-900">
          ¥{receipt.amount.toLocaleString()}<span className="text-base"> -</span>
        </p>
      </div>

      {/* 但し書き */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <p className="text-xs text-gray-500 mb-0.5">但し書き</p>
        <p className="text-sm font-medium text-gray-800">{receipt.description}</p>
        {receipt.meetingTitle && (
          <p className="text-xs text-gray-500 mt-0.5">（{receipt.meetingTitle}）</p>
        )}
      </div>

      {/* 発行情報 */}
      <div className="flex justify-between items-end">
        <div>
          <p className="text-xs text-gray-500">発行日</p>
          <p className="text-sm text-gray-800">{formatDate(receipt.issuedDate)}</p>
        </div>
        <div className="text-right flex items-end gap-3">
          <div>
            <p className="text-sm font-bold text-gray-900">{receipt.clubName}</p>
            {receipt.clubAddress && <p className="text-xs text-gray-500">{receipt.clubAddress}</p>}
            {receipt.clubPhone && <p className="text-xs text-gray-500">TEL: {receipt.clubPhone}</p>}
          </div>
          {/* 印章スペース */}
          <div className="w-12 h-12 border-2 border-gray-300 rounded-full flex items-center justify-center text-xs text-gray-300 shrink-0">
            印
          </div>
        </div>
      </div>
    </div>
  );
}
