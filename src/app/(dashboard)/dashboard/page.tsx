import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, meetings, annualFees, transactions, attendances, emails, receipts } from '@/lib/db/schema';
import { eq, and, isNull, gte, lte, isNotNull, inArray, count, desc, asc } from 'drizzle-orm';
import DashboardContent from '@/components/dashboard/DashboardContent';
import AnnouncementBanner from '@/components/dashboard/AnnouncementBanner';

export const metadata = { title: 'ダッシュボード' };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // pending ユーザーは承認待ちページへ
  if ((session.user as any).status === 'pending') redirect('/pending');

  const db = getDbFromContext();

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

  if (!profile?.clubId) {
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

  const clubId = profile.clubId;
  const isClubAccount = userRole === 'club_account';
  const isMember = userRole === 'member';
  const isAdminRole = ['system_owner', 'district_admin'].includes(userRole);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  // アナウンス用データ（クラブアカウント / 管理者向け）
  let pendingMembersCount = 0;
  let memberAnnualFeeStatus: { paid: boolean; year: number } | null = null;
  let myNextMeetingAttendance: { meetingId: string; meetingTitle: string; meetingDate: string; answered: boolean } | null = null;

  if (isClubAccount || isAdminRole) {
    const pendingResult = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.clubId, clubId), eq(users.status, 'pending'), isNull(users.deletedAt)));
    pendingMembersCount = pendingResult[0]?.value || 0;
  }

  if (isMember) {
    const currentYear = now.getFullYear();
    const feeResult = await db
      .select({ paymentStatus: annualFees.paymentStatus, year: annualFees.year })
      .from(annualFees)
      .where(and(
        eq(annualFees.userId, session.user.id),
        eq(annualFees.year, currentYear),
        isNull(annualFees.deletedAt),
      ))
      .limit(1);
    if (feeResult[0]) {
      memberAnnualFeeStatus = { paid: feeResult[0].paymentStatus === 'paid', year: currentYear };
    }
  }

  // 並列クエリ実行
  const [
    nextMeetingResult,
    upcomingMeetingsResult,
    membersCountResult,
    annualFeesCountResult,
    transactionsResult,
    unissuedReceiptsResult,
    recentMuResult,
    recentEmailsResult,
  ] = await Promise.all([
    // 次回例会
    db.select({
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
      .limit(1),

    // 直近5件
    db.select({ id: meetings.id, title: meetings.title, date: meetings.date, status: meetings.status })
      .from(meetings)
      .where(and(eq(meetings.clubId, clubId), isNull(meetings.deletedAt)))
      .orderBy(desc(meetings.date))
      .limit(5),

    // メンバー数
    db.select({ value: count() })
      .from(users)
      .where(and(eq(users.clubId, clubId), eq(users.isActive, true), isNull(users.deletedAt))),

    // 年会費未納数
    db.select({ value: count() })
      .from(annualFees)
      .where(and(eq(annualFees.clubId, clubId), eq(annualFees.paymentStatus, 'unpaid'), isNull(annualFees.deletedAt))),

    // 今月収支
    db.select({ transactionType: transactions.transactionType, amount: transactions.amount })
      .from(transactions)
      .where(and(
        eq(transactions.clubId, clubId),
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
    db.select({ id: emails.id, subject: emails.subject, status: emails.status, sentAt: emails.sentAt, targetType: emails.targetType })
      .from(emails)
      .where(and(eq(emails.clubId, clubId), eq(emails.status, 'sent'), isNull(emails.deletedAt)))
      .orderBy(desc(emails.sentAt))
      .limit(5),
  ]);

  const monthlyIncome = transactionsResult
    .filter(t => t.transactionType === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlyExpense = transactionsResult
    .filter(t => t.transactionType === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const nextMeeting = nextMeetingResult[0] || null;

  return (
    <div className="space-y-4">
      {/* アナウンスバナー */}
      <AnnouncementBanner
        userRole={userRole}
        pendingMembersCount={pendingMembersCount}
        unpaidAnnualFees={annualFeesCountResult[0]?.value || 0}
        unissuedReceipts={unissuedReceiptsResult[0]?.value || 0}
        nextMeeting={nextMeeting as any}
        memberAnnualFeeStatus={memberAnnualFeeStatus}
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
      />
    </div>
  );
}
