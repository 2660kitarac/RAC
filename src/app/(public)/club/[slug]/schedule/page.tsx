import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubs, meetings } from '@/lib/db/schema';
import { eq, and, isNull, gte, lte, inArray, asc, ne, or } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { Calendar, Clock, MapPin, ArrowLeft, Users } from 'lucide-react';
import { MEETING_STATUS_LABELS, MEETING_STATUS_COLORS } from '@/types';

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; year?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab = sp.tab === 'other' ? 'other' : 'own';

  let db: Awaited<ReturnType<typeof getDbFromContext>>;
  try {
    db = await getDbFromContext();
  } catch (e) {
    console.error('[schedule] DB接続エラー:', e);
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center text-gray-500">
        <div>
          <p className="text-lg font-semibold mb-2">一時的なエラーが発生しました</p>
          <p className="text-sm">ページを再読み込みしてください</p>
        </div>
      </div>
    );
  }

  const club = await db
    .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName, districtId: clubs.districtId })
    .from(clubs)
    .where(and(eq(clubs.slug, slug), eq(clubs.isActive, true), isNull(clubs.deletedAt)))
    .then((r: any[]) => r[0]);

  if (!club) notFound();

  const today = new Date().toISOString().split('T')[0];
  // 過去1年分まで表示（3ヶ月 → 1年に拡大）
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [ownMeetings, otherMeetings] = await Promise.all([
    // 自クラブ（過去1年〜今後、全ステータス）
    db
      .select({
        id: meetings.id,
        title: meetings.title,
        date: meetings.date,
        startTime: meetings.startTime,
        endTime: meetings.endTime,
        venueName: meetings.venueName,
        status: meetings.status,
        muRegistrationSlug: meetings.muRegistrationSlug,
        feeRac: meetings.feeRac,
        description: meetings.description,
      })
      .from(meetings)
      .where(
        and(
          eq(meetings.clubId, club.id),
          inArray(meetings.status, ['open', 'closed', 'finished', 'draft', 'cancelled']),
          gte(meetings.date, oneYearAgo),
          isNull(meetings.deletedAt)
        )
      )
      .orderBy(asc(meetings.date))
      .limit(100),

    // 地区内他クラブ（今後のみ）
    db
      .select({
        id: meetings.id,
        title: meetings.title,
        date: meetings.date,
        startTime: meetings.startTime,
        venueName: meetings.venueName,
        status: meetings.status,
        muRegistrationSlug: meetings.muRegistrationSlug,
        feeRac: meetings.feeRac,
        clubId: meetings.clubId,
      })
      .from(meetings)
      .where(
        and(
          ne(meetings.clubId, club.id),
          inArray(meetings.status, ['open', 'closed']),
          gte(meetings.date, today),
          isNull(meetings.deletedAt)
        )
      )
      .orderBy(asc(meetings.date))
      .limit(50),
  ]);

  // 他クラブ名を取得
  const otherClubIds = [...new Set(otherMeetings.map(m => m.clubId))];
  const otherClubsData = otherClubIds.length > 0
    ? await db
        .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName })
        .from(clubs)
        .where(inArray(clubs.id, otherClubIds))
    : [];
  const clubMap = new Map(otherClubsData.map(c => [c.id, c]));

  const displayMeetings = tab === 'own' ? ownMeetings : otherMeetings;

  // 自クラブ: 過去と今後に分ける
  const pastMeetings = ownMeetings.filter(m => m.date < today);
  const futureMeetings = ownMeetings.filter(m => m.date >= today);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/club/${slug}/dashboard`} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-base font-bold text-gray-900">例会スケジュール</h1>
        </div>

        {/* タブ */}
        <div className="max-w-lg mx-auto px-4 pb-0 flex border-t">
          <Link
            href={`/club/${slug}/schedule?tab=own`}
            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
              tab === 'own'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Calendar className="h-4 w-4 inline mr-1.5" />
            自クラブ
          </Link>
          <Link
            href={`/club/${slug}/schedule?tab=other`}
            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
              tab === 'other'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="h-4 w-4 inline mr-1.5" />
            他クラブ
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {tab === 'own' ? (
          // 自クラブ: 今後→過去の順で表示
          <>
            {futureMeetings.length === 0 && pastMeetings.length === 0 ? (
              <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">例会情報がありません</p>
              </div>
            ) : (
              <>
                {/* 今後の例会 */}
                {futureMeetings.length > 0 && (
                  <div className="space-y-3">
                    {futureMeetings.map(m => (
                      <MeetingCard key={m.id} m={m} today={today} tab={tab} />
                    ))}
                  </div>
                )}

                {/* 過去の例会 */}
                {pastMeetings.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pt-2">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400 font-medium px-2">過去の例会</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                    <div className="space-y-3">
                      {/* 過去は新しい順（descending）で表示 */}
                      {[...pastMeetings].reverse().map(m => (
                        <MeetingCard key={m.id} m={m} today={today} tab={tab} isPast />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          // 他クラブ
          displayMeetings.length === 0 ? (
            <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">他クラブの例会情報がありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayMeetings.map(m => {
                const meetingClub = clubMap.get((m as any).clubId);
                return (
                  <MeetingCard key={m.id} m={m} today={today} tab={tab} clubLabel={meetingClub?.shortName || meetingClub?.name} />
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function MeetingCard({
  m, today, tab, isPast = false, clubLabel,
}: {
  m: any;
  today: string;
  tab: string;
  isPast?: boolean;
  clubLabel?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${isPast ? 'opacity-70' : ''}`}>
      <div className="p-4">
        {clubLabel && (
          <p className="text-xs font-medium text-purple-600 mb-1">{clubLabel}</p>
        )}
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-900 text-sm flex-1 min-w-0 truncate">{m.title}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
            MEETING_STATUS_COLORS[m.status as keyof typeof MEETING_STATUS_COLORS] || 'bg-gray-100 text-gray-600'
          }`}>
            {MEETING_STATUS_LABELS[m.status as keyof typeof MEETING_STATUS_LABELS] || m.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />{formatDate(m.date)}
          </span>
          {m.startTime && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />{m.startTime.substring(0, 5)}
              {m.endTime && `〜${m.endTime.substring(0, 5)}`}
            </span>
          )}
          {m.venueName && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />{m.venueName}
            </span>
          )}
        </div>
        {m.description && (
          <p className="text-xs text-gray-400 mt-2 line-clamp-2">{m.description}</p>
        )}
        {m.status === 'open' && m.muRegistrationSlug && (
          <div className="mt-3">
            <Link
              href={`/mu/${m.muRegistrationSlug}`}
              className={`block w-full text-center text-white text-sm font-medium py-2 rounded-lg transition-colors ${
                tab === 'other' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              MU登録する
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
