'use client';

import Link from 'next/link';
import {
  Calendar, Users, Receipt, Mail, TrendingUp, TrendingDown,
  AlertCircle, CheckCircle, Clock, ArrowRight, Building2, Bell
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatCurrency, formatDateTime } from '@/lib/utils';
import type { User, Meeting, Attendance, Email } from '@/types';
import { MEETING_STATUS_LABELS, MEETING_STATUS_COLORS } from '@/types';

interface DeadlineAlert {
  id: string;
  title: string;
  date: string;
  registrationDeadline: string;
}

interface UnpaidAlert {
  meetingId: string;
  unpaidCount: number;
  title: string;
  date: string;
}

interface CapacityAlert {
  id: string;
  title: string;
  date: string;
  capacity: number;
  attendanceCount: number;
  fillRate: number;
}

interface DashboardContentProps {
  user: User;
  nextMeeting: Meeting | null;
  upcomingMeetings: Meeting[];
  totalMembers: number;
  unpaidAnnualFees: number;
  unissuedReceipts: number;
  recentMuRegistrations: Attendance[];
  recentEmails: Email[];
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyBalance: number;
  deadlineAlerts?: DeadlineAlert[];
  unpaidAlerts?: UnpaidAlert[];
  capacityAlerts?: CapacityAlert[];
}

export default function DashboardContent({
  user,
  nextMeeting,
  upcomingMeetings,
  totalMembers,
  unpaidAnnualFees,
  unissuedReceipts,
  recentMuRegistrations,
  recentEmails,
  monthlyIncome,
  monthlyExpense,
  monthlyBalance,
  deadlineAlerts = [],
  unpaidAlerts = [],
  capacityAlerts = [],
}: DashboardContentProps) {
  const totalAlerts = (unpaidAnnualFees > 0 ? 1 : 0) + (unissuedReceipts > 0 ? 1 : 0)
    + deadlineAlerts.length + unpaidAlerts.length + capacityAlerts.length;
  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          ダッシュボード
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {user.club?.name || 'RAC Cloud'} の管理画面
        </p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="会員数"
          value={`${totalMembers}名`}
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          href="/members"
        />
        <SummaryCard
          title="今月の収入"
          value={formatCurrency(monthlyIncome)}
          icon={TrendingUp}
          iconColor="text-green-600"
          iconBg="bg-green-50"
          href="/finance/transactions"
        />
        <SummaryCard
          title="今月の支出"
          value={formatCurrency(monthlyExpense)}
          icon={TrendingDown}
          iconColor="text-red-600"
          iconBg="bg-red-50"
          href="/finance/transactions"
        />
        <SummaryCard
          title="今月の収支"
          value={formatCurrency(monthlyBalance)}
          icon={monthlyBalance >= 0 ? TrendingUp : TrendingDown}
          iconColor={monthlyBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}
          iconBg={monthlyBalance >= 0 ? 'bg-blue-50' : 'bg-orange-50'}
          href="/finance/transactions"
        />
      </div>

      {/* アラートカード */}
      {totalAlerts > 0 && (
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-orange-500" />
              アラート
              <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">{totalAlerts}件</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {unpaidAnnualFees > 0 && (
                <AlertCard
                  title="年会費未納"
                  description={`${unpaidAnnualFees}名の会員の年会費が未納です`}
                  href="/finance/annual-fees"
                  variant="warning"
                />
              )}
              {unissuedReceipts > 0 && (
                <AlertCard
                  title="領収書未発行"
                  description={`${unissuedReceipts}件の領収書が発行待ちです`}
                  href="/receipts"
                  variant="info"
                />
              )}
              {deadlineAlerts.map(m => (
                <AlertCard
                  key={m.id}
                  title="登録締切が近い例会"
                  description={`「${m.title}」の締切は${m.registrationDeadline}です`}
                  href={`/meetings/${m.id}`}
                  variant="warning"
                />
              ))}
              {unpaidAlerts.map(u => (
                <AlertCard
                  key={u.meetingId}
                  title="未払い参加者が多い例会"
                  description={`「${u.title}」に未払いが${u.unpaidCount}名います`}
                  href={`/meetings/${u.meetingId}`}
                  variant="error"
                />
              ))}
              {capacityAlerts.map(m => (
                <AlertCard
                  key={m.id}
                  title="定員に近い例会"
                  description={`「${m.title}」は定員${m.capacity}名に対し${m.attendanceCount}名（${m.fillRate}%）です`}
                  href={`/meetings/${m.id}`}
                  variant="info"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 次回例会 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">次回例会</CardTitle>
            <Link href="/meetings">
              <Button variant="ghost" size="sm" className="text-xs">
                一覧を見る <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {nextMeeting ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{nextMeeting.title}</h3>
                    {nextMeeting.theme && (
                      <p className="text-sm text-gray-500 mt-0.5">テーマ: {nextMeeting.theme}</p>
                    )}
                  </div>
                  <Badge className={MEETING_STATUS_COLORS[nextMeeting.status]}>
                    {MEETING_STATUS_LABELS[nextMeeting.status]}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <span className="text-gray-700">{formatDate(nextMeeting.date)}</span>
                  </div>
                  {nextMeeting.start_time && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span className="text-gray-700">{nextMeeting.start_time.substring(0, 5)}</span>
                    </div>
                  )}
                  {nextMeeting.venue_name && (
                    <div className="flex items-center gap-2 text-sm col-span-2">
                      <Building2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span className="text-gray-700 truncate">{nextMeeting.venue_name}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Link href={`/meetings/${nextMeeting.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">詳細を見る</Button>
                  </Link>
                  <Link href={`/meetings/${nextMeeting.id}/attendances`} className="flex-1">
                    <Button size="sm" className="w-full">出席管理</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">予定されている例会はありません</p>
                <Link href="/meetings/new" className="mt-3 inline-block">
                  <Button size="sm">例会を作成する</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 直近の例会一覧 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">直近の例会</CardTitle>
            <Link href="/meetings">
              <Button variant="ghost" size="sm" className="text-xs">
                すべて見る <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingMeetings.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {upcomingMeetings.map(meeting => (
                  <Link
                    key={meeting.id}
                    href={`/meetings/${meeting.id}`}
                    className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{meeting.title}</p>
                      <p className="text-xs text-gray-500">{formatDate(meeting.date)}</p>
                    </div>
                    <Badge className={MEETING_STATUS_COLORS[meeting.status]} >
                      {MEETING_STATUS_LABELS[meeting.status]}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 px-6">
                <p className="text-gray-500 text-sm">例会がありません</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 最近のMU登録 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">最近のMU登録</CardTitle>
            <Link href="/attendances">
              <Button variant="ghost" size="sm" className="text-xs">
                一覧を見る <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentMuRegistrations.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {recentMuRegistrations.map(attendance => (
                  <div
                    key={attendance.id}
                    className="flex items-center justify-between px-6 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {attendance.external_name || '名前なし'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(attendance as any).meeting?.title} · {formatDate(attendance.registered_at)}
                      </p>
                    </div>
                    <Badge variant={attendance.payment_status === 'paid' ? 'success' : 'warning'}>
                      {attendance.payment_status === 'paid' ? '支払済' : '未払い'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 px-6">
                <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">MU登録はありません</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 最近のメール送信 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">メール送信履歴</CardTitle>
            <Link href="/emails/history">
              <Button variant="ghost" size="sm" className="text-xs">
                すべて見る <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentEmails.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {recentEmails.map(email => (
                  <div
                    key={email.id}
                    className="flex items-center justify-between px-6 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{email.subject}</p>
                      <p className="text-xs text-gray-500">
                        {email.sent_at ? formatDateTime(email.sent_at) : '-'}
                      </p>
                    </div>
                    <div className="ml-2 flex-shrink-0">
                      {email.status === 'sent' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : email.status === 'failed' ? (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 px-6">
                <Mail className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">送信履歴はありません</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* クイックアクション */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">クイックアクション</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QuickAction href="/meetings/new" icon={Calendar} label="例会を作成" color="blue" />
            <QuickAction href="/meetings/reception" icon={Users} label="当日受付" color="green" />
            <QuickAction href="/emails/compose" icon={Mail} label="メールを作成" color="purple" />
            <QuickAction href="/receipts" icon={Receipt} label="領収書を発行" color="orange" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// サブコンポーネント
// ============================================================

function SummaryCard({
  title, value, icon: Icon, iconColor, iconBg, href,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className={`p-2 rounded-lg ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-1">{title}</p>
          <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function AlertCard({
  title, description, href, variant,
}: {
  title: string;
  description: string;
  href: string;
  variant: 'warning' | 'info' | 'error';
}) {
  const colors = {
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    error: 'bg-red-50 border-red-200 text-red-800',
  };

  const iconColors = {
    warning: 'text-yellow-500',
    info: 'text-blue-500',
    error: 'text-red-500',
  };

  return (
    <Link href={href}>
      <div className={`flex items-center gap-3 p-4 rounded-lg border ${colors[variant]} hover:opacity-80 transition-opacity cursor-pointer`}>
        <AlertCircle className={`h-5 w-5 flex-shrink-0 ${iconColors[variant]}`} />
        <div>
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs opacity-75 mt-0.5">{description}</p>
        </div>
        <ArrowRight className="h-4 w-4 ml-auto flex-shrink-0" />
      </div>
    </Link>
  );
}

function QuickAction({
  href, icon: Icon, label, color,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100',
    green: 'bg-green-50 text-green-600 hover:bg-green-100',
    purple: 'bg-purple-50 text-purple-600 hover:bg-purple-100',
    orange: 'bg-orange-50 text-orange-600 hover:bg-orange-100',
  };

  return (
    <Link href={href}>
      <div className={`flex flex-col items-center gap-2 p-4 rounded-lg ${colors[color]} transition-colors cursor-pointer`}>
        <Icon className="h-6 w-6" />
        <span className="text-xs font-medium text-center">{label}</span>
      </div>
    </Link>
  );
}
