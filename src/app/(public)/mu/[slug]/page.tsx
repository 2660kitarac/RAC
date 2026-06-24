import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, clubs, users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import MuRegistrationForm from '@/components/attendances/MuRegistrationForm';

export default async function MuRegistrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const db = await getDbFromContext();

  // 例会情報取得（公開情報のみ）
  const meeting = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      theme: meetings.theme,
      date: meetings.date,
      startTime: meetings.startTime,
      endTime: meetings.endTime,
      venueName: meetings.venueName,
      venueAddress: meetings.venueAddress,
      feeRac: meetings.feeRac,
      feeRc: meetings.feeRc,
      feeObog: meetings.feeObog,
      feeGuest: meetings.feeGuest,
      mealFee: meetings.mealFee,
      registrationDeadline: meetings.registrationDeadline,
      status: meetings.status,
      description: meetings.description,
      clubId: meetings.clubId,
    })
    .from(meetings)
    .where(and(eq(meetings.muRegistrationSlug, slug), isNull(meetings.deletedAt)))
    .get();

  if (!meeting) notFound();

  // クラブ名取得
  const club = await db
    .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName })
    .from(clubs)
    .where(eq(clubs.id, meeting.clubId))
    .get();

  if (meeting.status === 'cancelled') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">😔</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">この例会は中止になりました</h1>
          <p className="text-gray-600">{meeting.title}</p>
        </div>
      </div>
    );
  }

  if (meeting.status === 'finished' || meeting.status === 'closed') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">登録受付は終了しました</h1>
          <p className="text-gray-600">{meeting.title}</p>
        </div>
      </div>
    );
  }

  // クラブ一覧（選択用）
  const clubList = await db
    .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName, type: clubs.type })
    .from(clubs)
    .where(and(eq(clubs.isActive, true), isNull(clubs.deletedAt)))
    .orderBy(clubs.name);

  // ログイン済みユーザー情報取得（認証失敗しても続行）
  let loggedInUser: {
    id: string;
    name: string;
    email: string;
    clubId: string | null;
    clubName: string | null;
  } | null = null;

  try {
    const session = await auth();
    if (session?.user?.id) {
      const userRow = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          clubId: users.clubId,
        })
        .from(users)
        .where(eq(users.id, session.user.id))
        .get();

      if (userRow) {
        // 所属クラブ名を取得
        let clubName: string | null = null;
        if (userRow.clubId) {
          const userClub = await db
            .select({ name: clubs.name })
            .from(clubs)
            .where(eq(clubs.id, userRow.clubId))
            .get();
          clubName = userClub?.name ?? null;
        }
        loggedInUser = { ...userRow, clubName };
      }
    }
  } catch {
    // 未ログインや認証エラーは無視
  }

  const meetingWithClub = { ...meeting, club: club ?? null };

  return (
    <MuRegistrationForm
      meeting={meetingWithClub as any}
      clubs={clubList as any}
      loggedInUser={loggedInUser}
    />
  );
}
