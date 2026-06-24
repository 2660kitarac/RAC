import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubs, meetings } from '@/lib/db/schema';
import { eq, and, isNull, gte, inArray, asc, ne } from 'drizzle-orm';
import { formatDate } from '@/lib/utils';
import { Calendar, MapPin, Clock, LogIn, Users, ChevronRight } from 'lucide-react';
import { MEETING_STATUS_LABELS, MEETING_STATUS_COLORS } from '@/types';

export default async function ClubTopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const db = await getDbFromContext();

  // クラブ情報をslugで取得
  const clubResult = await db
    .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName, districtId: clubs.districtId, district: clubs.district, area: clubs.area })
    .from(clubs)
    .where(and(eq(clubs.slug, slug), eq(clubs.isActive, true), isNull(clubs.deletedAt)))
    .limit(1);

  const club = clubResult[0];
  if (!club) notFound();

  const today = new Date().toISOString().split('T')[0];

  const [ownMeetingsResult, otherMeetingsResult] = await Promise.all([
    db.select({
      id: meetings.id, title: meetings.title, date: meetings.date,
      startTime: meetings.startTime, venueName: meetings.venueName,
      status: meetings.status, muRegistrationSlug: meetings.muRegistrationSlug, feeRac: meetings.feeRac,
    })
      .from(meetings)
      .where(and(
        eq(meetings.clubId, club.id),
        inArray(meetings.status, ['open', 'closed', 'finished']),
        gte(meetings.date, today),
        isNull(meetings.deletedAt),
      ))
      .orderBy(asc(meetings.date))
      .limit(10),

    db.select({
      id: meetings.id, title: meetings.title, date: meetings.date,
      startTime: meetings.startTime, venueName: meetings.venueName,
      status: meetings.status, muRegistrationSlug: meetings.muRegistrationSlug,
      clubId: meetings.clubId,
    })
      .from(meetings)
      .where(and(
        ne(meetings.clubId, club.id),
        inArray(meetings.status, ['open', 'closed']),
        gte(meetings.date, today),
        isNull(meetings.deletedAt),
      ))
      .orderBy(asc(meetings.date))
      .limit(10),
  ]);

  // 他クラブ名取得
  const otherClubIds = [...new Set(otherMeetingsResult.map(m => m.clubId))];
  const clubMap: Record<string, { name: string; shortName: string | null }> = {};
  if (otherClubIds.length > 0) {
    const { inArray: inArr } = await import('drizzle-orm');
    const clubRows = await db.select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName })
      .from(clubs).where(inArr(clubs.id, otherClubIds));
    clubRows.forEach(c => { clubMap[c.id] = { name: c.name, shortName: c.shortName }; });
  }

  const otherMeetings = otherMeetingsResult.map(m => ({
    ...m,
    club: clubMap[m.clubId] || null,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white">
        <div className="max-w-lg mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">RAC Cloud</p>
              <h1 className="text-xl font-bold mt-0.5">{club.shortName || club.name}</h1>
              <p className="text-blue-200 text-sm mt-0.5">{club.name}</p>
            </div>
            <Link href={`/club/${slug}/login`} className="flex items-center gap-1.5 bg-white text-blue-600 px-4 py-2 rounded-full text-sm font-semibold shadow hover:bg-blue-50 transition-colors">
              <LogIn className="h-4 w-4" />ログイン
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />例会スケジュール
            </h2>
            <Link href={`/club/${slug}/schedule`} className="text-xs text-blue-600 flex items-center gap-0.5">
              すべて見る <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {ownMeetingsResult.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm border">予定されている例会はありません</div>
          ) : (
            <div className="space-y-2">
              {ownMeetingsResult.map(m => (
                <div key={m.id} className="bg-white rounded-xl border overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{m.title}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(m.date)}</span>
                          {m.startTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{m.startTime.substring(0, 5)}</span>}
                        </div>
                        {m.venueName && <p className="flex items-center gap-1 text-xs text-gray-400 mt-1"><MapPin className="h-3 w-3" />{m.venueName}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${MEETING_STATUS_COLORS[m.status as keyof typeof MEETING_STATUS_COLORS] || 'bg-gray-100 text-gray-600'}`}>
                        {MEETING_STATUS_LABELS[m.status as keyof typeof MEETING_STATUS_LABELS] || m.status}
                      </span>
                    </div>
                    {m.status === 'open' && m.muRegistrationSlug && (
                      <div className="mt-3">
                        <Link href={`/mu/${m.muRegistrationSlug}`} className="block w-full text-center bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors">
                          MU登録する
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />他クラブの例会
            </h2>
            <span className="text-xs text-gray-400">地区内</span>
          </div>
          {otherMeetings.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm border">他クラブの例会情報はありません</div>
          ) : (
            <div className="space-y-2">
              {otherMeetings.map(m => (
                <div key={m.id} className="bg-white rounded-xl border overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-purple-600 mb-0.5">{m.club?.shortName || m.club?.name}</p>
                        <p className="font-semibold text-gray-900 text-sm truncate">{m.title}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(m.date)}</span>
                          {m.startTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{m.startTime.substring(0, 5)}</span>}
                        </div>
                        {m.venueName && <p className="flex items-center gap-1 text-xs text-gray-400 mt-1"><MapPin className="h-3 w-3" />{m.venueName}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${MEETING_STATUS_COLORS[m.status as keyof typeof MEETING_STATUS_COLORS] || 'bg-gray-100 text-gray-600'}`}>
                        {MEETING_STATUS_LABELS[m.status as keyof typeof MEETING_STATUS_LABELS] || m.status}
                      </span>
                    </div>
                    {m.status === 'open' && m.muRegistrationSlug && (
                      <div className="mt-3">
                        <Link href={`/mu/${m.muRegistrationSlug}`} className="block w-full text-center bg-purple-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-purple-700 transition-colors">
                          MU登録する
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-center">
          <p className="text-sm font-medium text-blue-800 mb-1">メンバーの方へ</p>
          <p className="text-xs text-blue-600 mb-4">ログインすると出席履歴・年会費・領収書を確認できます</p>
          <Link href={`/club/${slug}/login`} className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-full text-sm font-semibold shadow hover:bg-blue-700 transition-colors">
            <LogIn className="h-4 w-4" />メンバーログイン
          </Link>
        </div>
      </div>
    </div>
  );
}
