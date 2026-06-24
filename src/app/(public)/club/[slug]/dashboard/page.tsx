import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, meetings, attendances, annualFees, receipts } from '@/lib/db/schema';
import { eq, and, isNull, gte, inArray, desc, asc } from 'drizzle-orm';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Calendar, Receipt, CreditCard, History, LogOut, ChevronRight, User, Users, Clock, MapPin } from 'lucide-react';
import { MEETING_STATUS_LABELS, MEETING_STATUS_COLORS } from '@/types';

export default async function MemberDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/club/${slug}/login`);

  const db = await getDbFromContext();

  // プロフィール取得
  const profileResult = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      clubId: users.clubId,
      role: users.role,
      allergy: users.allergy,
      club: { id: clubs.id, name: clubs.name, shortName: clubs.shortName, slug: clubs.slug },
    })
    .from(users)
    .leftJoin(clubs, eq(users.clubId, clubs.id))
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
    .limit(1);

  const profile = profileResult[0];
  if (!profile) redirect(`/club/${slug}/login`);

  const today = new Date().toISOString().split('T')[0];
  const clubId = profile.clubId;
  const currentYear = new Date().getFullYear();

  const [upcomingResult, muHistoryResult, annualFeeResult, receiptsResult] = await Promise.all([
    clubId ? db.select({
      id: meetings.id, title: meetings.title, date: meetings.date,
      startTime: meetings.startTime, venueName: meetings.venueName,
      status: meetings.status, muRegistrationSlug: meetings.muRegistrationSlug,
    })
      .from(meetings)
      .where(and(
        eq(meetings.clubId, clubId),
        inArray(meetings.status, ['open', 'closed', 'finished']),
        gte(meetings.date, today),
        isNull(meetings.deletedAt),
      ))
      .orderBy(asc(meetings.date))
      .limit(3)
    : Promise.resolve([]),

    db.select({
      id: attendances.id,
      meetingId: attendances.meetingId,
      paymentStatus: attendances.paymentStatus,
      feeAmount: attendances.feeAmount,
      registeredAt: attendances.registeredAt,
    })
      .from(attendances)
      .where(and(
        isNull(attendances.userId),
        eq(attendances.externalEmail, profile.email),
        isNull(attendances.deletedAt),
      ))
      .orderBy(desc(attendances.registeredAt))
      .limit(3),

    clubId ? db.select({
      id: annualFees.id,
      fiscalYear: annualFees.fiscalYear,
      amount: annualFees.amount,
      paymentStatus: annualFees.paymentStatus,
      paidAt: annualFees.paidAt,
    })
      .from(annualFees)
      .where(and(eq(annualFees.userId, profile.id), isNull(annualFees.deletedAt)))
      .orderBy(desc(annualFees.fiscalYear))
      .limit(3)
    : Promise.resolve([]),

    clubId ? db.select({
      id: receipts.id,
      receiptNumber: receipts.receiptNumber,
      receiptName: receipts.receiptName,
      amount: receipts.amount,
      issuedDate: receipts.issuedDate,
      status: receipts.status,
      description: receipts.description,
    })
      .from(receipts)
      .where(and(eq(receipts.clubId, clubId), isNull(receipts.deletedAt)))
      .orderBy(desc(receipts.issuedDate))
      .limit(3)
    : Promise.resolve([]),
  ]);

  // MU履歴に例会タイトルを付加
  const muMeetingIds = [...new Set(muHistoryResult.map(a => a.meetingId))];
  const muMeetingMap: Record<string, { title: string; date: string }> = {};
  if (muMeetingIds.length > 0) {
    const { inArray: inArr } = await import('drizzle-orm');
    const rows = await db.select({ id: meetings.id, title: meetings.title, date: meetings.date })
      .from(meetings).where(inArr(meetings.id, muMeetingIds));
    rows.forEach(m => { muMeetingMap[m.id] = { title: m.title, date: m.date }; });
  }

  const muHistory = muHistoryResult.map(a => ({ ...a, meeting: muMeetingMap[a.meetingId] || null }));
  const currentFee = annualFeeResult.find(f => f.fiscalYear === currentYear);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-xs">RAC Cloud</p>
              <h1 className="text-lg font-bold">{profile.club?.shortName || profile.club?.name}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium">{profile.name}</p>
                <p className="text-blue-200 text-xs">メンバー</p>
              </div>
              <Link href={`/club/${slug}`} className="p-2 rounded-full bg-blue-500 hover:bg-blue-400 transition-colors" title="ログアウト">
                <LogOut className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: `schedule`, icon: <Calendar className="h-5 w-5 text-blue-600" />, bg: 'bg-blue-100', label: 'スケジュール' },
            { href: `my/attendance`, icon: <History className="h-5 w-5 text-green-600" />, bg: 'bg-green-100', label: '出席・MU履歴' },
            { href: `my/annual-fee`, icon: <CreditCard className="h-5 w-5 text-yellow-600" />, bg: 'bg-yellow-100', label: '年会費' },
            { href: `my/receipts`, icon: <Receipt className="h-5 w-5 text-purple-600" />, bg: 'bg-purple-100', label: '領収書' },
          ].map(item => (
            <Link key={item.href} href={`/club/${slug}/${item.href}`} className="bg-white rounded-xl border p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow active:scale-95">
              <div className={`w-10 h-10 ${item.bg} rounded-full flex items-center justify-center`}>{item.icon}</div>
              <span className="text-xs font-medium text-gray-700">{item.label}</span>
            </Link>
          ))}
        </div>

        {currentFee && currentFee.paymentStatus === 'unpaid' && (
          <Link href={`/club/${slug}/my/annual-fee`} className="block bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-yellow-800">{currentYear}年度 年会費が未納です</p>
                <p className="text-xs text-yellow-600 mt-0.5">{formatCurrency(currentFee.amount)}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-yellow-500" />
            </div>
          </Link>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><Calendar className="h-4 w-4 text-blue-500" />直近の例会</h2>
            <Link href={`/club/${slug}/schedule`} className="text-xs text-blue-600 flex items-center gap-0.5">すべて <ChevronRight className="h-3 w-3" /></Link>
          </div>
          {upcomingResult.length === 0 ? (
            <div className="bg-white rounded-xl border p-6 text-center text-gray-400 text-sm">予定はありません</div>
          ) : (
            <div className="space-y-2">
              {upcomingResult.map((m: any) => (
                <div key={m.id} className="bg-white rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{m.title}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(m.date)}</span>
                        {m.startTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{m.startTime.substring(0, 5)}</span>}
                        {m.venueName && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.venueName}</span>}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${MEETING_STATUS_COLORS[m.status as keyof typeof MEETING_STATUS_COLORS] || 'bg-gray-100 text-gray-600'}`}>
                      {MEETING_STATUS_LABELS[m.status as keyof typeof MEETING_STATUS_LABELS] || m.status}
                    </span>
                  </div>
                  {m.status === 'open' && m.muRegistrationSlug && (
                    <Link href={`/mu/${m.muRegistrationSlug}`} className="block mt-3 w-full text-center bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors">
                      MU登録する
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><Users className="h-4 w-4 text-green-500" />最近のMU履歴</h2>
            <Link href={`/club/${slug}/my/attendance`} className="text-xs text-blue-600 flex items-center gap-0.5">すべて <ChevronRight className="h-3 w-3" /></Link>
          </div>
          {muHistory.length === 0 ? (
            <div className="bg-white rounded-xl border p-6 text-center text-gray-400 text-sm">MU履歴はありません</div>
          ) : (
            <div className="bg-white rounded-xl border divide-y">
              {muHistory.map((a: any) => (
                <div key={a.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.meeting?.title || '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.meeting?.date ? formatDate(a.meeting.date) : '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono">{formatCurrency(a.feeAmount)}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${a.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {a.paymentStatus === 'paid' ? '支払済' : '未払い'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <Link href={`/club/${slug}/my/profile`} className="flex items-center justify-between bg-white rounded-xl border p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{profile.name}</p>
              <p className="text-xs text-gray-400">プロフィール編集</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </Link>
      </div>
    </div>
  );
}
