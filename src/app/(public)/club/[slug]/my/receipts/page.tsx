import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, receipts, meetings } from '@/lib/db/schema';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';
import { ArrowLeft, Receipt, Download, FileText } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';

const PAGE_SIZE = 20;

export default async function MyReceiptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/club/${slug}/login`);

  const db = getDbFromContext();
  const userId = session.user.id!;

  // プロフィール取得
  const profile = await db
    .select({ id: users.id, name: users.name, clubId: users.clubId })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .get();

  if (!profile?.clubId) redirect(`/club/${slug}/dashboard`);

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const [receiptList, countResult] = await Promise.all([
    db
      .select({
        id: receipts.id,
        receiptNumber: receipts.receiptNumber,
        receiptName: receipts.receiptName,
        amount: receipts.amount,
        description: receipts.description,
        issuedDate: receipts.issuedDate,
        status: receipts.status,
        pdfUrl: receipts.pdfUrl,
        meetingTitle: meetings.title,
      })
      .from(receipts)
      .leftJoin(meetings, eq(receipts.meetingId, meetings.id))
      .where(
        and(
          eq(receipts.clubId, profile.clubId!),
          eq(receipts.status, 'issued'),
          isNull(receipts.deletedAt)
        )
      )
      .orderBy(desc(receipts.issuedDate))
      .limit(PAGE_SIZE)
      .offset(offset),

    db
      .select({ total: count() })
      .from(receipts)
      .where(
        and(
          eq(receipts.clubId, profile.clubId!),
          eq(receipts.status, 'issued'),
          isNull(receipts.deletedAt)
        )
      ),
  ]);

  const receiptsCount = countResult[0]?.total ?? 0;
  const totalPages = Math.ceil(receiptsCount / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/club/${slug}/dashboard`} className="p-1.5 rounded-full hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-purple-600" /> 領収書
          </h1>
          <span className="ml-auto text-xs text-gray-400">{receiptsCount}件</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {receiptList.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">領収書がありません</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border divide-y overflow-hidden">
              {receiptList.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-400">{r.receiptNumber}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{r.receiptName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
                      {r.meetingTitle && (
                        <p className="text-xs text-blue-600 mt-0.5">{r.meetingTitle}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-sm font-bold text-gray-800">{formatCurrency(r.amount)}</span>
                        <span className="text-xs text-gray-400">{formatDate(r.issuedDate)}</span>
                      </div>
                    </div>
                    {/* PDFダウンロード or 印刷用リンク */}
                    {r.pdfUrl ? (
                      <a
                        href={r.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 flex flex-col items-center gap-1 p-2 bg-purple-50 rounded-lg text-purple-600 hover:bg-purple-100 transition-colors"
                      >
                        <Download className="h-5 w-5" />
                        <span className="text-xs">PDF</span>
                      </a>
                    ) : (
                      <Link
                        href={`/club/${slug}/my/receipts/${r.id}/print`}
                        className="flex-shrink-0 flex flex-col items-center gap-1 p-2 bg-gray-50 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        <FileText className="h-5 w-5" />
                        <span className="text-xs">表示</span>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={receiptsCount}
              pageSize={PAGE_SIZE}
            />
          </>
        )}
      </div>
    </div>
  );
}
