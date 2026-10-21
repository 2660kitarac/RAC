import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import PrintToolbar from '@/components/receipts/PrintToolbar';
import ReceiptStamp from '@/components/receipts/ReceiptStamp';
import { ReceiptPrintSlip } from '@/components/receipts/ReceiptPrintSlip';
import { canPrintReceipt } from '@/lib/auth/tenant';

export const metadata = { title: '領収書印刷' };

export default async function AdminReceiptPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const receipt = await db
    .select({
      id: receipts.id,
      receiptNumber: receipts.receiptNumber,
      receiptName: receipts.receiptName,
      receiptClubName: receipts.receiptClubName,
      amount: receipts.amount,
      description: receipts.description,
      issuedDate: receipts.issuedDate,
      status: receipts.status,
      clubId: receipts.clubId,
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
    .where(and(eq(receipts.id, id), isNull(receipts.deletedAt)))
    .then((r: any[]) => r[0]);

  // 他クラブ・取消済みの領収書は印刷させない。存在が分からないよう 404 にする（IDOR 対策）
  if (!receipt || !canPrintReceipt(session.user, receipt)) notFound();

  // A4縦に5枚収めるため、同じ領収書を5枚並べる
  const copies = Array(5).fill(receipt);

  return (
    <div className="min-h-screen bg-gray-100 print:min-h-0 print:bg-white">
      {/* 操作バー（印刷時非表示 / Client Component） */}
      <PrintToolbar
        backHref="/receipts"
        note="A4縦・5枚印刷"
        maxWidthClass="max-w-2xl"
      />

      {/* 画面プレビュー（印刷時は非表示） */}
      <div className="screen-only max-w-2xl mx-auto p-6">
        <div className="mb-3 text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          📄 印刷時はA4縦1枚に同じ領収書が5枚並んで出力されます
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <ReceiptContent receipt={receipt} />
        </div>
      </div>

      {/* 印刷用レイアウト（画面では非表示・印刷時のみ表示） */}
      <div className="print-root">
        <div className="print-page">
          {copies.map((r, i) => (
            <ReceiptPrintSlip key={i} receipt={r} withCutLine={i < copies.length - 1} />
          ))}
        </div>
      </div>

      <style>{`
        /* ===== 印刷用スタイル ===== */
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

          /* 1ページ＝領収書5枚分。高さは固定しない（先頭見切れ防止） */
          .print-page {
            width: 190mm;
            display: block;
            overflow: visible;
          }
        }
      `}</style>
    </div>
  );
}

/** 画面プレビュー用レイアウト */
function ReceiptContent({ receipt }: { receipt: any }) {
  return (
    <>
      <h1 className="text-3xl font-bold text-center text-gray-900 mb-1 tracking-widest">領 収 書</h1>
      <p className="text-center text-xs text-gray-400 mb-6">No. {receipt.receiptNumber}</p>

      <div className="border-b-2 border-gray-900 pb-2 mb-6">
        {receipt.receiptClubName && (
          <p className="text-sm font-bold text-gray-700">{receipt.receiptClubName}</p>
        )}
        <p className="text-xl font-bold text-gray-900">{receipt.receiptName} 様</p>
      </div>

      <div className="text-center mb-6">
        <p className="text-sm text-gray-500 mb-1">金額</p>
        <p className="text-4xl font-bold text-gray-900">
          ¥{receipt.amount.toLocaleString()}<span className="text-lg"> -</span>
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <p className="text-xs text-gray-500 mb-1">但し書き</p>
        <p className="text-sm font-medium text-gray-800">{receipt.description}</p>
        {receipt.meetingTitle && (
          <p className="text-xs text-gray-500 mt-1">（{receipt.meetingTitle}）</p>
        )}
      </div>

      <div className="flex justify-between items-end">
        <div>
          <p className="text-xs text-gray-500">発行日</p>
          <p className="text-sm font-medium text-gray-800">{formatDate(receipt.issuedDate)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900">{receipt.clubName}</p>
          {receipt.clubAddress && <p className="text-xs text-gray-500 mt-0.5">{receipt.clubAddress}</p>}
          {receipt.clubPhone && <p className="text-xs text-gray-500">TEL: {receipt.clubPhone}</p>}
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <ReceiptStamp stamp={receipt} size="64px" />
      </div>
    </>
  );
}
