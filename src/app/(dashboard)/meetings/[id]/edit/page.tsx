import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, users } from '@/lib/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import MeetingForm from '@/components/meetings/MeetingForm';

export const metadata = { title: '例会編集' };

export default async function MeetingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();

  const clubId = session.user.clubId;

  const [meetingResult, membersResult] = await Promise.all([
    db.select().from(meetings).where(and(eq(meetings.id, id), isNull(meetings.deletedAt))).limit(1),
    db.select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.isActive, true), isNull(users.deletedAt)))
      .orderBy(asc(users.name)),
  ]);

  const meeting = meetingResult[0];
  if (!meeting) notFound();

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">例会を編集</h1>
        <p className="text-sm text-gray-500 mt-1">{meeting.title}</p>
      </div>
      <MeetingForm
        mode="edit"
        clubId={clubId || ''}
        meeting={meeting as any}
        members={membersResult}
      />
    </div>
  );
}
