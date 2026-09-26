import { redirect, notFound } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings } from '@/lib/db/schema';
import { canManageClub, canMutateClubRecord } from '@/lib/auth/tenant';
import { buildResume } from '@/lib/resume/build';
import PrintToolbar from '@/components/receipts/PrintToolbar';
import ResumeDocument from '@/components/resume/ResumeDocument';

export const metadata = { title: 'レジュメ印刷' };

export default async function ResumePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();
  const [m] = await db
    .select({ id: meetings.id, clubId: meetings.clubId })
    .from(meetings)
    .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
    .limit(1);
  if (!m) notFound();

  // 名簿（写真・勤務先）を含むため、クラブの運営ロールだけに見せる
  const user = session.user as { role?: string; clubId?: string | null };
  if (!canManageClub(user.role) || !canMutateClubRecord(user, m.clubId)) redirect(`/meetings/${id}`);

  const view = await buildResume(db, id);
  if (!view) notFound();

  return (
    <div className="print:bg-white">
      <PrintToolbar backHref={`/meetings/${id}/resume`} note="A4縦・2ページ" maxWidthClass="max-w-4xl" />
      <div className="print:hidden mx-auto mt-3 max-w-4xl px-1 text-xs text-gray-600">
        ブラウザの印刷画面で「送信先：PDFに保存」を選ぶとPDFになります。余白は「デフォルト」、背景のグラフィックはオンにしてください。
      </div>
      {/* スマホでは紙の幅のまま横スクロールで確認する */}
      <div className="scroll-x mt-4 print:mt-0 print:overflow-visible">
        <ResumeDocument view={view} />
      </div>
    </div>
  );
}
