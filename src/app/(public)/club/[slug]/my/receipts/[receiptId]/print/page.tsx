import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, receipts, meetings, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import PrintToolbar from '@/components/receipts/PrintToolbar';
import { ReceiptPreview, ReceiptPrintSheets, ReceiptStyles } from '@/components/receipts/ReceiptSlip';

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
      receiptClubName: receipts.receiptClubName,
      amount: receipts.amount,
      description: receipts.description,
      issuedDate: receipts.issuedDate,
      status: receipts.status,
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
    .where(
      and(
        eq(receipts.id, receiptId),
        eq(receipts.clubId, profile.clubId!),
        // 一覧（マイ領収書）と同じく、発行済みで削除されていないものだけ印刷できる
        eq(receipts.status, 'issued'),
        isNull(receipts.deletedAt),
      )
    )
    .then((r:any[])=>r[0]);

  if (!receipt) notFound();

  return (
    <div className="min-h-screen bg-gray-100 print:min-h-0 print:bg-white">
      {/* 操作バー（印刷時は非表示 / Client Component） */}
      <PrintToolbar backHref={`/club/${slug}/my/receipts`} maxWidthClass="max-w-3xl" />

      {/* 画面プレビュー（印刷と同じレイアウトを縮小表示。印刷時は非表示） */}
      <div className="rs-screen mx-auto max-w-3xl space-y-3 p-4 sm:p-6">
        <ReceiptPreview receipt={receipt} />
        <p className="text-xs text-gray-500">「印刷 / PDF保存」から、紙に印刷するかPDFとして保存できます。</p>
      </div>

      <ReceiptPrintSheets receipts={[receipt]} />
      <ReceiptStyles />
    </div>
  );
}
