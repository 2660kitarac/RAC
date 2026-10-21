import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import PrintToolbar from '@/components/receipts/PrintToolbar';
import { ReceiptPreview, ReceiptPrintSheets, ReceiptStyles } from '@/components/receipts/ReceiptSlip';
import { canManageFinance, isDistrictScope } from '@/lib/auth/tenant';

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
  // 領収書の印刷は会計権限のあるロールのみ
  if (!canManageFinance(session.user.role)) redirect('/receipts');

  const params = await searchParams;
  const db = await getDbFromContext();

  const clubId = session.user.clubId;
  // クラブに属さないのは地区スタッフだけ（それ以外は何も出さない）
  if (!clubId && !isDistrictScope(session.user.role)) redirect('/receipts');

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
  } else if (params.meetingId && clubId) {
    // 例会IDで発行済み領収書を取得
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
    <div className="min-h-screen bg-gray-100 print:min-h-0 print:bg-white">
      <PrintToolbar
        backHref="/receipts"
        note={`${receiptList.length}件（A4縦・1ページに5枚）`}
        printLabel="全件印刷 / PDF保存"
        sticky
        maxWidthClass="max-w-3xl"
      />

      {receiptList.length === 0 ? (
        <div className="rs-screen flex min-h-64 items-center justify-center p-6 text-center text-gray-500">
          <div>
            <p className="text-lg">印刷できる領収書がありません</p>
            <p className="mt-1 text-sm">一括発行してから、このページを開いてください</p>
          </div>
        </div>
      ) : (
        <div className="rs-screen mx-auto max-w-3xl space-y-3 p-4 sm:p-6">
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-gray-700">
            印刷すると、A4縦1枚に5枚ずつ並び、間に切り取り線が入ります。
          </p>
          {receiptList.map(r => <ReceiptPreview key={r.id} receipt={r} />)}
        </div>
      )}

      <ReceiptPrintSheets receipts={receiptList} />
      <ReceiptStyles />
    </div>
  );
}
