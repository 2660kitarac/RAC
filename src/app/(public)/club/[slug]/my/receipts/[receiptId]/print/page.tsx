import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import { formatDate, formatCurrency } from '@/lib/utils';
import PrintToolbar from '@/components/receipts/PrintToolbar';

export default async function ReceiptPrintPage({
  params,
}: {
  params: Promise<{ slug: string; receiptId: string }>;
}) {
  const { slug, receiptId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/club/${slug}/login`);

  const db = await getDbFromContext();
  const userId = session.user.id!;

  // プロフィール取得
  const profile = await db
    .select({ id: users.id, clubId: users.clubId })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .then((r:any[])=>r[0]);

  if (!profile?.clubId) redirect(`/club/${slug}/dashboard`);

  // 領収書取得（自クラブのものに限定）
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
    .where(
      and(
        eq(receipts.id, receiptId),
        eq(receipts.clubId, profile.clubId!)
      )
    )
    .then((r:any[])=>r[0]);

  if (!receipt) notFound();

  return (
    <div className="min-h-screen bg-gray-100 print:min-h-0 print:bg-white">
      {/* 操作バー（印刷時は非表示 / Client Component） */}
      <PrintToolbar
        backHref={`/club/${slug}/my/receipts`}
        maxWidthClass="max-w-lg"
      />

      {/* 領収書本体 */}
      <div className="max-w-md mx-auto p-6 print:p-0 print:max-w-none">
        <div className="bg-white rounded-2xl shadow-sm p-8 print:shadow-none print:rounded-none">
          {/* タイトル */}
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-1 tracking-widest">領 収 書</h1>
          <p className="text-center text-xs text-gray-400 mb-6">No. {receipt.receiptNumber}</p>

          {/* 宛名 */}
          <div className="border-b-2 border-gray-900 pb-2 mb-6">
            <p className="text-xl font-bold text-gray-900">{receipt.receiptName} 様</p>
          </div>

          {/* 金額 */}
          <div className="text-center mb-6">
            <p className="text-sm text-gray-500 mb-1">金額</p>
            <p className="text-4xl font-bold text-gray-900">
              ¥{receipt.amount.toLocaleString()}<span className="text-lg"> -</span>
            </p>
          </div>

          {/* 但し書き */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-xs text-gray-500 mb-1">但し書き</p>
            <p className="text-sm font-medium text-gray-800">{receipt.description}</p>
            {receipt.meetingTitle && (
              <p className="text-xs text-gray-500 mt-1">（{receipt.meetingTitle}）</p>
            )}
          </div>

          {/* 発行情報 */}
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

          {/* 印章スペース */}
          <div className="flex justify-end mt-4">
            <div className="w-16 h-16 border-2 border-gray-300 rounded-full flex items-center justify-center text-xs text-gray-300">
              印
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }
      `}</style>
    </div>
  );
}
