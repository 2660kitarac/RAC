import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import PrintToolbar from '@/components/receipts/PrintToolbar';
import { ReceiptPreview, ReceiptPrintSheets, ReceiptStyles } from '@/components/receipts/ReceiptSlip';
import { canManageFinance, canMutateClubRecord } from '@/lib/auth/tenant';

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

  // 他クラブの領収書・会計権限のない人には見せない（存在も明かさない）
  if (!receipt || !canManageFinance(session.user.role) || !canMutateClubRecord(session.user, receipt.clubId)) notFound();

  // A4縦1枚に同じ領収書を5枚並べて印刷する（切り取って使う）
  const copies = Array.from({ length: 5 }, () => receipt);

  return (
    <div className="min-h-screen bg-gray-100 print:min-h-0 print:bg-white">
      <PrintToolbar backHref="/receipts" note="A4縦・同じ領収書を5枚" maxWidthClass="max-w-3xl" />

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
