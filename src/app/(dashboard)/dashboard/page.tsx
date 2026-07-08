import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, meetings, annualFees, transactions, attendances, emails, receipts } from '@/lib/db/schema';
import { eq, and, isNull, gte, lte, isNotNull, inArray, count, desc, asc, lt, sql } from 'drizzle-orm';
import DashboardContent from '@/components/dashboard/DashboardContent';
import AnnouncementBanner from '@/components/dashboard/AnnouncementBanner';
import MemberDashboard from '@/components/dashboard/MemberDashboard';

export const metadata = { title: 'ダッシュボード' };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // pending ユーザーは承認待ちページへ
  if ((session.user as any).status === 'pending') redirect('/pending');

  const db = await getDbFromContext();

  // プロフィール取得
  const profileResult = await db
    .select({
      id: users.id,
      clubId: users.clubId,
      role: users.role,
      name: users.name,
      email: users.email,
      club: {
        id: clubs.id,
        name: clubs.name,
        shortName: clubs.shortName,
      },
    })
    .from(users)
    .leftJoin(clubs, eq(users.clubId, clubs.id))
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
    .limit(1);

  const profile = profileResult[0] ?? null;
  const userRole = (session.user as any).role || '';
  const userStatus = (session.user as any).status || 'active';
  const isAdminRole = ['system_owner', 'district_admin'].includes(userRole);
  const isClubAccount = userRole === 'club_account';
  const isMember = userRole === 'member';

  // system_owner / district_admin はクラブ未設定でもダッシュボードを表示
  if (!profile?.clubId && !isAdminRole) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">クラブが設定されていません</h2>
        <p className="text-gray-500">管理者にクラブへの紐付けを依頼してください。</p>
      </div>
    );
  }

  // ── 個人会員（member）は専用ダッシュボードを表示 ──────────
  if (isMember) {
    // memberType 取得
    const typeResult = await db
      .select({ memberType: users.memberType })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const memberType = typeResult[0]?.memberType || 'RAC';

    // 年会費ステータス（アナウンスバナー用）
    const currentYear = new Date().getFullYear();
    const feeResult = await db
      .select({ paymentStatus: annualFees.paymentStatus, year: annualFees.fiscalYear })
      .from(annualFees)
      .where(and(
        eq(annualFees.userId, session.user.id),
        eq(annualFees.fiscalYear, currentYear),
        isNull(annualFees.deletedAt),
      ))
      .limit(1);
    const memberAnnualFeeStatus = feeResult[0]
      ? { paid: feeResult[0].paymentStatus === 'paid', year: currentYear }
      : null;

    return (
      <div className="space-y-4 max-w-2xl mx-auto px-4 pb-10">
        {/* 年会費未納バナーのみ表示 */}
        <AnnouncementBanner
          userRole={userRole}
          pendingMembersCount={0}
          unpaidAnnualFees={0}
          unissuedReceipts={0}
          nextMeeting={null}
          memberAnnualFeeStatus={memberAnnualFeeStatus}
        />
        <MemberDashboard
          userName={profile?.name || 'メンバー'}
          clubName={profile?.club?.name || ''}
          memberType={memberType}
        />
      </div>
    );
  }
  // ────────────────────────────────────────────────────────

  const clubId = profile?.clubId ?? null;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const threeDaysLaterStr = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  // アナウンス用データ（クラブアカウント / 管理者向け）
  let pendingMembersCount = 0;

  if (isClubAccount || isAdminRole) {
    const pendingResult = clubId
      ? await db
          .select({ value: count() })
          .from(users)
          .where(and(eq(users.clubId, clubId), eq(users.status, 'pending'), isNull(users.deletedAt)))
      : await db
          .select({ value: count() })
          .from(users)
          .where(and(eq(users.status, 'pending'), isNull(users.deletedAt)));
    pendingMembersCount = pendingResult[0]?.value || 0;
  }


  // 並列クエリ実行（clubId が null の場合は全クラブ集計）
  const [
    nextMeetingResult,
    upcomingMeetingsResult,
    membersCountResult,
    annualFeesCountResult,
    transactionsResult,
    unissuedReceiptsResult,
    recentMuResult,
    recentEmailsResult,
    deadlineAlertMeetings,
    unpaidAlertMeetings,
    capacityMeetings,
  ] = await Promise.all([
    // 次回例会
    clubId
      ? db.select({
          id: meetings.id, title: meetings.title, date: meetings.date,
          status: meetings.status, theme: meetings.theme,
          startTime: meetings.startTime, venueName: meetings.venueName, clubId: meetings.clubId,
        })
          .from(meetings)
          .where(and(
            eq(meetings.clubId, clubId),
            isNull(meetings.deletedAt),
            gte(meetings.date, todayStr),
            inArray(meetings.status, ['open', 'closed']),
          ))
          .orderBy(asc(meetings.date))
          .limit(1)
      : db.select({
          id: meetings.id, title: meetings.title, date: meetings.date,
          status: meetings.status, theme: meetings.theme,
          startTime: meetings.startTime, venueName: meetings.venueName, clubId: meetings.clubId,
        })
          .from(meetings)
          .where(and(
            isNull(meetings.deletedAt),
            gte(meetings.date, todayStr),
            inArray(meetings.status, ['open', 'closed']),
          ))
          .orderBy(asc(meetings.date))
          .limit(1),

    // 直近5件
    clubId
      ? db.select({ id: meetings.id, title: meetings.title, date: meetings.date, status: meetings.status })
          .from(meetings)
          .where(and(eq(meetings.clubId, clubId), isNull(meetings.deletedAt)))
          .orderBy(desc(meetings.date))
          .limit(5)
      : db.select({ id: meetings.id, title: meetings.title, date: meetings.date, status: meetings.status })
          .from(meetings)
          .where(isNull(meetings.deletedAt))
          .orderBy(desc(meetings.date))
          .limit(5),

    // メンバー数
    clubId
      ? db.select({ value: count() })
          .from(users)
          .where(and(eq(users.clubId, clubId), eq(users.isActive, true), isNull(users.deletedAt)))
      : db.select({ value: count() })
          .from(users)
          .where(and(eq(users.isActive, true), isNull(users.deletedAt))),

    // 年会費未納数
    clubId
      ? db.select({ value: count() })
          .from(annualFees)
          .where(and(eq(annualFees.clubId, clubId), eq(annualFees.paymentStatus, 'unpaid'), isNull(annualFees.deletedAt)))
      : db.select({ value: count() })
          .from(annualFees)
          .where(and(eq(annualFees.paymentStatus, 'unpaid'), isNull(annualFees.deletedAt))),

    // 今月収支
    clubId
      ? db.select({ transactionType: transactions.transactionType, amount: transactions.amount })
          .from(transactions)
          .where(and(
            eq(transactions.clubId, clubId),
            isNull(transactions.deletedAt),
            gte(transactions.transactionDate, firstDayOfMonth),
            lte(transactions.transactionDate, lastDayOfMonth),
          ))
      : db.select({ transactionType: transactions.transactionType, amount: transactions.amount })
          .from(transactions)
          .where(and(
            isNull(transactions.deletedAt),
            gte(transactions.transactionDate, firstDayOfMonth),
            lte(transactions.transactionDate, lastDayOfMonth),
          )),

    // 領収書未発行数
    db.select({ value: count() })
      .from(attendances)
      .where(and(
        eq(attendances.receiptRequired, true),
        eq(attendances.paymentStatus, 'paid'),
        isNull(attendances.deletedAt),
      )),

    // 最近のMU登録
    db.select({
      id: attendances.id,
      externalName: attendances.externalName,
      paymentStatus: attendances.paymentStatus,
      registeredAt: attendances.registeredAt,
      meetingId: attendances.meetingId,
    })
      .from(attendances)
      .where(and(isNull(attendances.userId), isNull(attendances.deletedAt)))
      .orderBy(desc(attendances.registeredAt))
      .limit(5),

    // 最近のメール
    clubId
      ? db.select({ id: emails.id, subject: emails.subject, status: emails.status, sentAt: emails.sentAt, targetType: emails.targetType })
          .from(emails)
          .where(and(eq(emails.clubId, clubId), eq(emails.status, 'sent'), isNull(emails.deletedAt)))
          .orderBy(desc(emails.sentAt))
          .limit(5)
      : db.select({ id: emails.id, subject: emails.subject, status: emails.status, sentAt: emails.sentAt, targetType: emails.targetType })
          .from(emails)
          .where(and(eq(emails.status, 'sent'), isNull(emails.deletedAt)))
          .orderBy(desc(emails.sentAt))
          .limit(5),

    // アラート①: 登録締切が3日以内のopenな例会
    clubId
      ? db.select({ id: meetings.id, title: meetings.title, date: meetings.date, registrationDeadline: meetings.registrationDeadline })
          .from(meetings)
          .where(and(
            eq(meetings.clubId, clubId),
            isNull(meetings.deletedAt),
            eq(meetings.status, 'open'),
            isNotNull(meetings.registrationDeadline),
            gte(meetings.registrationDeadline, todayStr),
            lte(meetings.registrationDeadline, threeDaysLaterStr),
          ))
          .orderBy(asc(meetings.registrationDeadline))
          .limit(5)
      : db.select({ id: meetings.id, title: meetings.title, date: meetings.date, registrationDeadline: meetings.registrationDeadline })
          .from(meetings)
          .where(and(
            isNull(meetings.deletedAt),
            eq(meetings.status, 'open'),
            isNotNull(meetings.registrationDeadline),
            gte(meetings.registrationDeadline, todayStr),
            lte(meetings.registrationDeadline, threeDaysLaterStr),
          ))
          .orderBy(asc(meetings.registrationDeadline))
          .limit(5),

    // アラート②: 未払い参加者が5人以上の例会（未来の例会のみ）
    clubId
      ? db.select({
            meetingId: attendances.meetingId,
            unpaidCount: count(),
          })
          .from(attendances)
          .innerJoin(meetings, eq(attendances.meetingId, meetings.id))
          .where(and(
            eq(meetings.clubId, clubId),
            isNull(meetings.deletedAt),
            isNull(attendances.deletedAt),
            eq(attendances.paymentStatus, 'unpaid'),
            gte(meetings.date, todayStr),
          ))
          .groupBy(attendances.meetingId)
          .having(sql`count(*) >= 5`)
          .limit(5)
      : db.select({
            meetingId: attendances.meetingId,
            unpaidCount: count(),
          })
          .from(attendances)
          .innerJoin(meetings, eq(attendances.meetingId, meetings.id))
          .where(and(
            isNull(meetings.deletedAt),
            isNull(attendances.deletedAt),
            eq(attendances.paymentStatus, 'unpaid'),
            gte(meetings.date, todayStr),
          ))
          .groupBy(attendances.meetingId)
          .having(sql`count(*) >= 5`)
          .limit(5),

    // アラート③: 定員90%以上の例会（未来のopen例会）
    clubId
      ? db.select({
            id: meetings.id,
            title: meetings.title,
            date: meetings.date,
            capacity: meetings.capacity,
            attendanceCount: count(attendances.id),
          })
          .from(meetings)
          .leftJoin(attendances, and(
            eq(attendances.meetingId, meetings.id),
            isNull(attendances.deletedAt),
          ))
          .where(and(
            eq(meetings.clubId, clubId),
            isNull(meetings.deletedAt),
            isNotNull(meetings.capacity),
            inArray(meetings.status, ['open', 'closed']),
            gte(meetings.date, todayStr),
          ))
          .groupBy(meetings.id, meetings.title, meetings.date, meetings.capacity)
          .limit(10)
      : db.select({
            id: meetings.id,
            title: meetings.title,
            date: meetings.date,
            capacity: meetings.capacity,
            attendanceCount: count(attendances.id),
          })
          .from(meetings)
          .leftJoin(attendances, and(
            eq(attendances.meetingId, meetings.id),
            isNull(attendances.deletedAt),
          ))
          .where(and(
            isNull(meetings.deletedAt),
            isNotNull(meetings.capacity),
            inArray(meetings.status, ['open', 'closed']),
            gte(meetings.date, todayStr),
          ))
          .groupBy(meetings.id, meetings.title, meetings.date, meetings.capacity)
          .limit(10),
  ]);

  const monthlyIncome = transactionsResult
    .filter(t => t.transactionType === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlyExpense = transactionsResult
    .filter(t => t.transactionType === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const nextMeeting = nextMeetingResult[0] || null;

  // アラートデータ加工
  // 定員90%以上の例会を抽出
  const nearCapacityMeetings = capacityMeetings
    .filter(m => m.capacity && m.attendanceCount >= Math.ceil(m.capacity * 0.9))
    .map(m => ({
      id: m.id,
      title: m.title,
      date: m.date,
      capacity: m.capacity!,
      attendanceCount: Number(m.attendanceCount),
      fillRate: Math.round((Number(m.attendanceCount) / m.capacity!) * 100),
    }));

  // 未払いアラート用に例会タイトルを取得（meetingIdから）
  const unpaidMeetingIds = unpaidAlertMeetings.map(u => u.meetingId);
  const unpaidMeetingDetails = unpaidMeetingIds.length > 0
    ? upcomingMeetingsResult.filter(m => unpaidMeetingIds.includes(m.id))
    : [];
  const unpaidAlertsWithCount = unpaidAlertMeetings.map(u => ({
    meetingId: u.meetingId,
    unpaidCount: Number(u.unpaidCount),
    title: upcomingMeetingsResult.find(m => m.id === u.meetingId)?.title || '例会',
    date: upcomingMeetingsResult.find(m => m.id === u.meetingId)?.date || '',
  }));

  return (
    <div className="space-y-4">
      {/* アナウンスバナー */}
      <AnnouncementBanner
        userRole={userRole}
        pendingMembersCount={pendingMembersCount}
        unpaidAnnualFees={annualFeesCountResult[0]?.value || 0}
        unissuedReceipts={unissuedReceiptsResult[0]?.value || 0}
        nextMeeting={nextMeeting as any}
        memberAnnualFeeStatus={null}
      />

      <DashboardContent
        user={profile as any}
        nextMeeting={nextMeeting as any}
        upcomingMeetings={upcomingMeetingsResult as any}
        totalMembers={membersCountResult[0]?.value || 0}
        unpaidAnnualFees={annualFeesCountResult[0]?.value || 0}
        unissuedReceipts={unissuedReceiptsResult[0]?.value || 0}
        recentMuRegistrations={recentMuResult as any}
        recentEmails={recentEmailsResult as any}
        monthlyIncome={monthlyIncome}
        monthlyExpense={monthlyExpense}
        monthlyBalance={monthlyIncome - monthlyExpense}
        deadlineAlerts={deadlineAlertMeetings as any}
        unpaidAlerts={unpaidAlertsWithCount as any}
        capacityAlerts={nearCapacityMeetings as any}
      />
    </div>
  );
}
