'use client';

/**
 * クラブ管理側（クラブアカウント・会長・幹事・会計など）のトップページ
 * スマホでの操作を中心に、上から「よく使う操作 → 対応が必要なこと → 次回例会 → スケジュール → 数字 → 履歴」の順に並べる。
 *
 *  ┌ クラブ名 ───────────────────┐
 *  │ よく使う操作（4つ）           │
 *  ├ 対応が必要なこと（あれば）───┤
 *  ├ 次回例会（受付・出席管理・詳細）┤
 *  ├ スケジュール［カレンダー｜一覧］┤
 *  ├ 会員数・今月の収支 ──────────┤
 *  └ 最近のMU登録・メール送信履歴（折りたたみ）┘
 */
import Link from 'next/link';
import {
  AlertCircle, ArrowRight, Bell, Building2, CalendarPlus, CheckCircle, ChevronDown, Clock, Mail, MapPin,
  Receipt, TrendingDown, TrendingUp, UserCheck, Users,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { User, Meeting, Attendance, Email } from '@/types';
import { MEETING_STATUS_LABELS, MEETING_STATUS_COLORS } from '@/types';
import { canAccessPage } from '@/lib/auth/page-access';
import ClubSchedule from './club/ClubSchedule';
import { DAYS_JA, parseYmd } from './member/types';

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
  /** 今日（日本時間 YYYY-MM-DD） */
  today: string;
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

/** サーバーからは camelCase、古い型定義は snake_case のため両方を見る */
function field(m: object, camel: string, snake: string): string | null {
  const r = m as Record<string, unknown>;
  return (r[camel] as string | null | undefined) ?? (r[snake] as string | null | undefined) ?? null;
}

const quickActions = [
  { href: '/meetings/new', icon: CalendarPlus, label: '例会を作成', className: 'bg-blue-50 text-blue-700' },
  { href: '/meetings/reception', icon: UserCheck, label: '当日受付', className: 'bg-green-50 text-green-700' },
  { href: '/emails/compose', icon: Mail, label: 'メール作成', className: 'bg-purple-50 text-purple-700' },
  { href: '/receipts', icon: Receipt, label: '領収書', className: 'bg-orange-50 text-orange-700' },
];

export default function DashboardContent({
  user,
  today,
  nextMeeting,
  totalMembers,
  unpaidAnnualFees,
  recentMuRegistrations,
  recentEmails,
  monthlyIncome,
  monthlyExpense,
  monthlyBalance,
  deadlineAlerts = [],
  unpaidAlerts = [],
  capacityAlerts = [],
}: DashboardContentProps) {
  const role = user?.role;
  // 開けないページへのボタン・リンクは出さない（ページの制限と同じ対応表。#46・#48）
  const can = (href: string) => canAccessPage(role, href);
  const actions = quickActions.filter(a => can(a.href));

  // 領収書は任意発行のため、未発行件数は「対応が必要なこと」に数えない
  const alerts: { key: string; title: string; description: string; href: string; tone: 'warning' | 'error' | 'info' }[] = [
    ...(unpaidAnnualFees > 0 ? [{
      key: 'fees', title: '年会費未納', description: `${unpaidAnnualFees}名の年会費が未納です`,
      href: '/finance/annual-fees', tone: 'warning' as const,
    }] : []),
    ...deadlineAlerts.map(m => ({
      key: `d-${m.id}`, title: '登録締切が近い', description: `「${m.title}」の締切は${formatDate(m.registrationDeadline)}です`,
      href: `/meetings/${m.id}`, tone: 'warning' as const,
    })),
    ...unpaidAlerts.map(u => ({
      key: `u-${u.meetingId}`, title: '未払いの参加者', description: `「${u.title}」に未払いが${u.unpaidCount}名います`,
      href: `/meetings/${u.meetingId}`, tone: 'error' as const,
    })),
    ...capacityAlerts.map(m => ({
      key: `c-${m.id}`, title: '定員に近い', description: `「${m.title}」は${m.attendanceCount}／${m.capacity}名（${m.fillRate}%）です`,
      href: `/meetings/${m.id}`, tone: 'info' as const,
    })),
  ].filter(a => can(a.href));

  const showFinance = can('/finance/transactions');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-6">
      {/* クラブ名 */}
      <header className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <Building2 className="h-3.5 w-3.5" />
          クラブ管理
        </p>
        <h1 className="mt-0.5 break-words text-xl font-bold text-gray-900 sm:text-2xl">
          {user?.club?.name || 'RAC Cloud'}
        </h1>
      </header>

      {/* よく使う操作 */}
      {actions.length > 0 && (
        <nav aria-label="よく使う操作" className="grid grid-cols-4 gap-2 sm:gap-3">
          {actions.map(({ href, icon: Icon, label, className }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 text-center transition-opacity active:opacity-70 hover:opacity-90',
                className,
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="text-[11px] font-semibold leading-tight sm:text-xs">{label}</span>
            </Link>
          ))}
        </nav>
      )}

      {/* 対応が必要なこと */}
      {alerts.length > 0 && (
        <section aria-labelledby="alerts-title" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-orange-200">
          <h2 id="alerts-title" className="mb-2 flex items-center gap-2 text-base font-bold text-gray-900">
            <Bell className="h-4 w-4 text-orange-500" />
            対応が必要なこと
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">{alerts.length}件</span>
          </h2>
          <ul className="divide-y divide-gray-100">
            {alerts.map(a => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center gap-3 py-3 active:bg-gray-50">
                  <AlertCircle className={cn(
                    'h-5 w-5 shrink-0',
                    a.tone === 'error' ? 'text-red-500' : a.tone === 'warning' ? 'text-amber-500' : 'text-blue-500',
                  )} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{a.title}</span>
                    <span className="block break-words text-xs text-gray-500">{a.description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <NextMeetingCard meeting={nextMeeting} today={today} can={can} />

          {/* 会員数・今月の収支 */}
          <section aria-label="クラブの数字" className="grid grid-cols-2 gap-2 sm:gap-3">
            <StatTile title="会員数" value={`${totalMembers}名`} icon={Users} tone="blue" href={can('/members') ? '/members' : null} />
            {showFinance && (
              <>
                <StatTile
                  title="今月の収支"
                  value={formatCurrency(monthlyBalance)}
                  icon={monthlyBalance >= 0 ? TrendingUp : TrendingDown}
                  tone={monthlyBalance >= 0 ? 'blue' : 'orange'}
                  href="/finance/transactions"
                />
                <StatTile title="今月の収入" value={formatCurrency(monthlyIncome)} icon={TrendingUp} tone="green" href="/finance/transactions" />
                <StatTile title="今月の支出" value={formatCurrency(monthlyExpense)} icon={TrendingDown} tone="red" href="/finance/transactions" />
              </>
            )}
          </section>
        </div>

        <ClubSchedule role={role} today={today} />
      </div>

      {/* 履歴（スマホでは長くなるため折りたたむ） */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <Collapsible
          title="最近のMU登録"
          count={recentMuRegistrations.length}
          href={can('/attendances') ? '/attendances' : null}
          empty="MU登録はありません"
        >
          {recentMuRegistrations.map(a => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{field(a, 'externalName', 'external_name') || '名前なし'}</p>
                <p className="truncate text-xs text-gray-500">{formatDate(field(a, 'registeredAt', 'registered_at') || '')}</p>
              </div>
              {(() => {
                const paid = field(a, 'paymentStatus', 'payment_status') === 'paid';
                return (
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
                  )}>
                    {paid ? '支払済' : '未払い'}
                  </span>
                );
              })()}
            </li>
          ))}
        </Collapsible>

        <Collapsible
          title="メール送信履歴"
          count={recentEmails.length}
          href={can('/emails/history') ? '/emails/history' : null}
          empty="送信履歴はありません"
        >
          {recentEmails.map(e => {
            const sentAt = field(e, 'sentAt', 'sent_at');
            return (
              <li key={e.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{e.subject}</p>
                  <p className="text-xs text-gray-500">{sentAt ? formatDateTime(sentAt) : '-'}</p>
                </div>
                {e.status === 'sent' ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-500" aria-label="送信済み" />
                ) : e.status === 'failed' ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" aria-label="送信失敗" />
                ) : (
                  <Clock className="h-4 w-4 shrink-0 text-gray-400" aria-label="送信待ち" />
                )}
              </li>
            );
          })}
        </Collapsible>
      </div>
    </div>
  );
}

// ============================================================
// サブコンポーネント
// ============================================================

function NextMeetingCard({
  meeting, today, can,
}: { meeting: Meeting | null; today: string; can: (href: string) => boolean }) {
  if (!meeting) {
    return (
      <section className="rounded-2xl bg-white px-4 py-8 text-center shadow-sm ring-1 ring-gray-200">
        <CalendarPlus className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">予定されている例会はありません</p>
        {can('/meetings/new') && (
          <Link
            href="/meetings/new"
            className="mt-3 inline-flex h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white active:bg-blue-700"
          >
            例会を作成する
          </Link>
        )}
      </section>
    );
  }

  const d = parseYmd(meeting.date);
  const days = Math.round((d.getTime() - parseYmd(today).getTime()) / 86400000);
  const startTime = field(meeting, 'startTime', 'start_time');
  const venueName = field(meeting, 'venueName', 'venue_name');
  const canMeetings = can('/meetings');

  return (
    <section aria-labelledby="club-next-meeting" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="flex gap-4 bg-blue-600 px-4 py-4 text-white">
        <div className="shrink-0 text-center">
          <p className="text-xs text-blue-100">{d.getMonth() + 1}月</p>
          <p className="text-4xl font-bold leading-none tabular-nums">{d.getDate()}</p>
          <p className="mt-1 text-xs text-blue-100">{DAYS_JA[d.getDay()]}曜日</p>
        </div>
        <div className="min-w-0 flex-1">
          <p id="club-next-meeting" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-blue-100">
            次回例会
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-white">
              {days <= 0 ? '今日' : days === 1 ? '明日' : `あと${days}日`}
            </span>
            {MEETING_STATUS_LABELS[meeting.status] && (
              <span className={cn('rounded-full px-2 py-0.5', MEETING_STATUS_COLORS[meeting.status])}>
                {MEETING_STATUS_LABELS[meeting.status]}
              </span>
            )}
          </p>
          <p className="mt-1 break-words text-lg font-bold leading-snug">{meeting.title}</p>
          {meeting.theme && <p className="mt-0.5 break-words text-sm text-blue-50">テーマ：{meeting.theme}</p>}
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-blue-50">
            {startTime && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{startTime.substring(0, 5)}〜</span>}
            {venueName && (
              <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="break-words">{venueName}</span></span>
            )}
          </p>
        </div>
      </div>
      {canMeetings && (
        <div className="grid grid-cols-3 gap-2 p-3">
          <Link
            href="/meetings/reception"
            className="flex h-11 items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700"
          >
            当日受付
          </Link>
          <Link
            href={`/meetings/${meeting.id}/attendances`}
            className="flex h-11 items-center justify-center rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 active:bg-gray-50"
          >
            出席管理
          </Link>
          <Link
            href={`/meetings/${meeting.id}`}
            className="flex h-11 items-center justify-center rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 active:bg-gray-50"
          >
            詳細
          </Link>
        </div>
      )}
    </section>
  );
}

const TILE_TONES = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  red: 'bg-red-50 text-red-600',
  orange: 'bg-orange-50 text-orange-600',
} as const;

function StatTile({
  title, value, icon: Icon, tone, href,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TILE_TONES;
  href: string | null;
}) {
  const body = (
    <>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TILE_TONES[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] text-gray-500">{title}</span>
        {/* 金額が切れないよう、数字は等幅でやや小さめに */}
        <span className="block truncate text-base font-bold tabular-nums text-gray-900 sm:text-lg">{value}</span>
      </span>
    </>
  );
  const cls = 'flex items-center gap-2.5 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-200';
  return href
    ? <Link href={href} className={cn(cls, 'active:bg-gray-50 hover:shadow-md transition-shadow')}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

function Collapsible({
  title, count, href, empty, children,
}: {
  title: string;
  count: number;
  href: string | null;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <summary className="flex h-14 cursor-pointer list-none items-center justify-between gap-2 px-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-base font-bold text-gray-900">
          {title}
          {count > 0 && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{count}件</span>}
        </span>
        <ChevronDown className="h-5 w-5 text-gray-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-gray-100 px-4 pb-2">
        {count > 0 ? (
          <ul className="divide-y divide-gray-100">{children}</ul>
        ) : (
          <p className="py-5 text-center text-sm text-gray-500">{empty}</p>
        )}
        {href && (
          <Link href={href} className="flex h-11 items-center justify-center gap-1 text-sm font-medium text-blue-700">
            すべて見る <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </details>
  );
}
