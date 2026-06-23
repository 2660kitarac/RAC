import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import MeetingForm from '@/components/meetings/MeetingForm';

export const metadata = { title: '例会作成' };

export default async function NewMeetingPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();

  const clubId = session.user.clubId;

  const membersResult = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(
      clubId ? eq(users.clubId, clubId) : isNull(users.deletedAt),
      eq(users.isActive, true),
      isNull(users.deletedAt),
    ))
    .orderBy(asc(users.name));

  return (
    <MeetingForm
      mode="create"
      clubId={clubId || ''}
      members={membersResult}
    />
  );
}
