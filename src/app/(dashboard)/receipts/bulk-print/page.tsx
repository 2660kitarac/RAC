import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull, inArray, like, type SQL } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import PrintToolbar from '@/components/receipts/PrintToolbar';
import { ReceiptPreview, ReceiptPrintSheets, ReceiptStyles, type ReceiptSlipData } from '@/components/receipts/ReceiptSlip';
import { isDistrictScope, canManageFinance } from '@/lib/auth/tenant';
import { receiptPrintColumns } from '@/lib/receipts/print-columns';

type PrintRow = ReceiptSlipData & { id: string };

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

  // 取得方法ごとの絞り込み条件（該当なしなら null）
  let target: SQL | undefined | null = null;
  if (params.ids && canQuery) {
    // IDリストで直接指定
    const ids = params.ids.split(',').filter(Boolean);
    if (ids.length > 0) target = and(inArray(receipts.id, ids), clubScope);
  } else if (params.meetingId && canQuery) {
    // 例会IDで発行済み領収書を取得
    target = and(eq(receipts.meetingId, params.meetingId), clubScope);
  } else if (params.fiscalYear && clubId && canQuery) {
    // 年会費で絞り込み（但し書きに「年会費」と年度が含まれるもの）
    target = and(
      eq(receipts.clubId, clubId),
      like(receipts.description, '%年会費%'),
      like(receipts.description, `%${params.fiscalYear}%`),
    );
  }

  let receiptList: PrintRow[] = [];
  if (target !== null) {
    receiptList = await db
      .select(receiptPrintColumns)
      .from(receipts)
      .leftJoin(meetings, eq(receipts.meetingId, meetings.id))
      .leftJoin(clubs, eq(receipts.clubId, clubs.id))
      .where(and(target, eq(receipts.status, 'issued'), isNull(receipts.deletedAt)))
      .orderBy(receipts.receiptNumber);
  }

  return (
    <div className="min-h-screen bg-gray-100 print:min-h-0 print:bg-white">
      {/* 操作バー（印刷時非表示 / Client Component） */}
      <PrintToolbar
        backHref="/receipts"
        note={`${receiptList.length}件（A4縦・1ページに5枚）`}
        printLabel="全件印刷 / PDF保存"
        sticky
        maxWidthClass="max-w-3xl"
      />

      {/* 画面プレビュー（印刷と同じレイアウトを縮小表示。印刷時は非表示） */}
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
          {receiptList.map((r) => <ReceiptPreview key={r.id} receipt={r} />)}
        </div>
      )}

      {/* 印刷用（A4縦に5枚ずつ。画面では非表示） */}
      <ReceiptPrintSheets receipts={receiptList} />
      <ReceiptStyles />
    </div>
  );
}
