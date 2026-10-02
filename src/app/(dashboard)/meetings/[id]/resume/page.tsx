import { redirect, notFound } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings } from '@/lib/db/schema';
import { canManageClub, canMutateClubRecord } from '@/lib/auth/tenant';
import { buildResume } from '@/lib/resume/build';
import ResumeEditor from '@/components/resume/ResumeEditor';

export const metadata = { title: 'レジュメ作成' };

export default async function ResumeEditPage({ params }: { params: Promise<{ id: string }> }) {
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

  // レジュメは例会を運営するロール（会長・幹事・クラブアカウント等）だけが作れる
  const user = session.user as { role?: string; clubId?: string | null };
  if (!canManageClub(user.role) || !canMutateClubRecord(user, m.clubId)) redirect(`/meetings/${id}`);

  const view = await buildResume(db, id);
  if (!view) notFound();

  return <ResumeEditor initialView={view} />;
}
