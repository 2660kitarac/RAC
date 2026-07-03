import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, emailTemplates, meetings } from '@/lib/db/schema';
import { eq, and, isNull, desc, or } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import EmailCompose from '@/components/emails/EmailCompose';

export const metadata = { title: 'メール作成' };

export default async function EmailComposePage({ searchParams }: { searchParams: Promise<{ meeting_id?: string }> }) {
  const { meeting_id } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();
  const userId = session.user.id;
  const clubId = session.user.clubId;

  // プロフィール取得（IDのみ）
  const profile = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .then((r:any[])=>r[0]);

  // テンプレート取得（自クラブ or グローバル）
  const templatesResult = clubId
    ? await db
        .select()
        .from(emailTemplates)
        .where(and(isNull(emailTemplates.deletedAt)))
    : await db
        .select()
        .from(emailTemplates)
        .where(isNull(emailTemplates.deletedAt));

  // clubId でフィルタリング（or null）
  const templates = clubId
    ? templatesResult.filter(t => t.clubId === clubId || t.clubId === null)
    : templatesResult;

  // 例会一覧
  const meetingRows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      date: meetings.date,
      theme: meetings.theme,
      startTime: meetings.startTime,
      endTime: meetings.endTime,
      venueName: meetings.venueName,
      venueAddress: meetings.venueAddress,
      feeRac: meetings.feeRac,
      feeRc: meetings.feeRc,
      feeObog: meetings.feeObog,
      feeGuest: meetings.feeGuest,
      registrationDeadline: meetings.registrationDeadline,
      muRegistrationUrl: meetings.muRegistrationUrl,
      description: meetings.description,
    })
    .from(meetings)
    .where(
      and(
        clubId ? eq(meetings.clubId, clubId) : undefined,
        isNull(meetings.deletedAt)
      )
    )
    .orderBy(desc(meetings.date))
    .limit(20);

  // メンバー一覧
  const memberRows = await db
    .select({ id: users.id, name: users.name, email: users.email, memberType: users.memberType })
    .from(users)
    .where(
      and(
        clubId ? eq(users.clubId, clubId) : undefined,
        eq(users.isActive, true),
        isNull(users.deletedAt)
      )
    );

  const selectedMeeting = meeting_id ? meetingRows.find(m => m.id === meeting_id) : null;

  return (
    <EmailCompose
      templates={templates as any}
      meetings={meetingRows as any}
      members={memberRows as any}
      selectedMeeting={selectedMeeting as any || null}
      clubId={clubId || ''}
      userId={profile?.id || userId}
    />
  );
}
