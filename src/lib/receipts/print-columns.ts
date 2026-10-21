import { receipts, meetings, clubs } from '@/lib/db/schema';

/**
 * 領収書の印刷（1枚印刷・一括印刷）で取得する列。
 *
 * receipts に meetings（meetingId）と clubs（clubId）を left join したクエリで使う。
 * 印刷部品（ReceiptPrintSlip）が表示する項目をすべて含む。印刷ページごとに列を
 * 書き分けると取得漏れが起きるため（#42）、必ずこの定義を使うこと。
 */
export const receiptPrintColumns = {
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
};
