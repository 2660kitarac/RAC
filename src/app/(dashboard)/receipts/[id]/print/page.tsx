import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import { formatDate } from '@/lib/utils';

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
      amount: receipts.amount,
      description: receipts.description,
      issuedDate: receipts.issuedDate,
      status: receipts.status,
      meetingTitle: meetings.title,
      clubName: clubs.name,
      clubAddress: clubs.address,
      clubPhone: clubs.phone,
    })
    .from(receipts)
    .leftJoin(meetings, eq(receipts.meetingId, meetings.id))
    .leftJoin(clubs, eq(receipts.clubId, clubs.id))
    .where(and(eq(receipts.id, id), isNull(receipts.deletedAt)))
    .then((r: any[]) => r[0]);

  if (!receipt) notFound();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 操作バー（印刷時非表示） */}
      <div className="print:hidden bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-gray-600 text-sm hover:text-gray-900"
          >
            ← 戻る
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              🖨️ 印刷 / PDF保存
            </button>
          </div>
        </div>
      </div>

      {/* 領収書本体 */}
      <div className="max-w-md mx-auto p-6 print:p-0 print:max-w-none">
        <ReceiptCard receipt={receipt} />
      </div>

      <style>{`
        @media print {
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function ReceiptCard({ receipt }: { receipt: any }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-8 print:shadow-none print:rounded-none">
      <h1 className="text-3xl font-bold text-center text-gray-900 mb-1 tracking-widest">領 収 書</h1>
      <p className="text-center text-xs text-gray-400 mb-6">No. {receipt.receiptNumber}</p>

      <div className="border-b-2 border-gray-900 pb-2 mb-6">
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
        <div className="w-16 h-16 border-2 border-gray-300 rounded-full flex items-center justify-center text-xs text-gray-300">
          印
        </div>
      </div>
    </div>
  );
}
