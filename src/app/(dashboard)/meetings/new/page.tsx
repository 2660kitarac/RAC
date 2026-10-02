import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, users } from '@/lib/db/schema';
import { eq, and, isNull, asc, desc, ne } from 'drizzle-orm';
import MeetingForm, { type CopyCandidate } from '@/components/meetings/MeetingForm';
import { canMutateClubRecord, canManageClub } from '@/lib/auth/tenant';
import { toCopiedMeetingFormValues } from '@/lib/meetings/form-mapping';

export const metadata = { title: '例会作成' };

/** コピー元候補として表示する過去例会の最大件数 */
const COPY_CANDIDATE_LIMIT = 50;

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { from: fromParam } = await searchParams;
  // 例会管理権限のないユーザーにはコピー機能を提供しない（多重防御）
  const canCopy = canManageClub(session.user.role);
  const from = canCopy ? fromParam : undefined;
  const db = await getDbFromContext();

  const clubId = session.user.clubId;

  const [membersResult, candidatesResult, sourceResult] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(
        clubId ? eq(users.clubId, clubId) : isNull(users.deletedAt),
        eq(users.isActive, true),
        isNull(users.deletedAt),
      ))
      .orderBy(asc(users.name)),
    // コピー元候補: 自クラブの過去例会（開催日の新しい順）
    clubId && canCopy
      ? db
          .select({
            id: meetings.id,
            title: meetings.title,
            date: meetings.date,
            meetingNumber: meetings.meetingNumber,
            status: meetings.status,
          })
          .from(meetings)
          .where(and(
            eq(meetings.clubId, clubId),
            isNull(meetings.deletedAt),
            ne(meetings.date, ''),
          ))
          .orderBy(desc(meetings.date), desc(meetings.createdAt))
          .limit(COPY_CANDIDATE_LIMIT)
      : Promise.resolve([]),
    from
      ? db
          .select()
          .from(meetings)
          .where(and(eq(meetings.id, from), isNull(meetings.deletedAt)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  // IDOR 対策: 他クラブの例会はコピー元にできない（地区スタッフを除く）
  const sourceRaw = (sourceResult as any[])[0];
  const source =
    sourceRaw && canMutateClubRecord(session.user, sourceRaw.clubId) ? sourceRaw : null;

  const copiedMeeting = source
    ? toCopiedMeetingFormValues(source, membersResult.map((m: { id: string }) => m.id))
    : undefined;

  const copyCandidates: CopyCandidate[] = (candidatesResult as any[]).map(c => ({
    id: c.id,
    title: c.title,
    date: c.date,
    meetingNumber: c.meetingNumber ?? null,
    status: c.status,
  }));

  return (
    <MeetingForm
      // コピー元が切り替わったらフォームを再マウントして初期値を入れ直す
      key={source?.id ?? 'blank'}
      mode="create"
      clubId={clubId || ''}
      members={membersResult}
      meeting={copiedMeeting as any}
      copyCandidates={copyCandidates}
      copySource={source ? { id: source.id, title: source.title, date: source.date } : null}
      copyNotFound={Boolean(fromParam) && !source}
    />
  );
}
