import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import PrintToolbar from '@/components/receipts/PrintToolbar';
import { ReceiptPreview, ReceiptPrintSheets, ReceiptStyles } from '@/components/receipts/ReceiptSlip';
import { canPrintReceipt } from '@/lib/auth/tenant';
import { receiptPrintColumns } from '@/lib/receipts/print-columns';

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
      ...receiptPrintColumns,
      status: receipts.status,
      clubId: receipts.clubId,
    })
    .from(receipts)
    .leftJoin(meetings, eq(receipts.meetingId, meetings.id))
    .leftJoin(clubs, eq(receipts.clubId, clubs.id))
    .where(and(eq(receipts.id, id), isNull(receipts.deletedAt)))
    .then((r) => r[0]);

  // 他クラブ・取消済みの領収書は印刷させない。存在が分からないよう 404 にする（IDOR 対策）
  if (!receipt || !canPrintReceipt(session.user, receipt)) notFound();

  // A4縦1枚に同じ領収書を5枚並べて印刷する（切り取って使う）
  const copies = Array.from({ length: 5 }, () => receipt);

  return (
    <div className="min-h-screen bg-gray-100 print:min-h-0 print:bg-white">
      <PrintToolbar backHref="/receipts" note="A4縦・同じ領収書を5枚" maxWidthClass="max-w-3xl" />

      {/* 画面プレビュー（印刷と同じレイアウトを縮小表示。印刷時は非表示） */}
      <div className="rs-screen mx-auto max-w-3xl space-y-3 p-4 sm:p-6">
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-gray-700">
          印刷すると、A4縦1枚にこの領収書が5枚並び、間に切り取り線が入ります。
        </p>
        <ReceiptPreview receipt={receipt} />
      </div>

      <ReceiptPrintSheets receipts={copies} />
      <ReceiptStyles />
    </div>
  );
}
