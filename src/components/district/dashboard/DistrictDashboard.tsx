/**
 * 地区役員ダッシュボードの本体（サーバーコンポーネント）
 * 「要対応」→ 数字 → 行事・申込 → クラブの状況 → お知らせ の順に、上から見れば分かる並びにする
 */
import Link from 'next/link';
import {
  AlertCircle, Bell, Building2, CalendarDays, CalendarPlus, Camera, CheckCircle2, ChevronRight,
  ClipboardCheck, ClipboardList, FileText, Megaphone, Users, Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DashboardData } from '@/lib/district/stats';
import { formatMd, formatYmd, yen } from './format';
import { EmptyText, PaymentBar, Section, StatTile } from './parts';

type TodoItem = { key: string; href: string; icon: typeof AlertCircle; title: string; detail: string; tone: 'red' | 'amber' | 'indigo' };

const TONE: Record<TodoItem['tone'], string> = {
  red: 'border-red-200 bg-red-50 text-red-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
};

const LEVEL_BADGE: Record<string, React.ReactNode> = {
  urgent: <Badge variant="destructive">緊急</Badge>,
  important: <Badge variant="warning">重要</Badge>,
};

export default function DistrictDashboard({ data }: { data: DashboardData }) {
  // 要対応（件数が 0 のものは出さない）
  const todos: TodoItem[] = [];
  if (data.pendingReports > 0) {
    todos.push({
      key: 'reports', href: '/district/reports', icon: FileText, tone: 'amber',
      title: `審査待ちの報告書 ${data.pendingReports}件`, detail: 'クラブから提出された報告書を確認してください',
    });
  }
  if (data.pendingInstagram > 0) {
    todos.push({
      key: 'instagram', href: '/district/instagram', icon: Camera, tone: 'amber',
      title: `審査待ちのInstagram ${data.pendingInstagram}件`, detail: '投稿を確認して承認・点数付けをしてください',
    });
  }
  if (data.unpaid.count > 0) {
    todos.push({
      key: 'unpaid', href: '/district/registrations', icon: Wallet, tone: 'red',
      title: `行事申込の未入金 ${data.unpaid.count}件（${yen(data.unpaid.amount)}）`,
      detail: '受付中のフォームで、まだ入金が確認できていない申込があります',
    });
  }
  for (const f of data.closingSoon) {
    todos.push({
      key: `deadline-${f.id}`, href: `/district/registrations/${f.id}`, icon: CalendarDays, tone: 'indigo',
      title: `「${f.title}」の申込締切が${f.daysLeft === 0 ? '今日' : `あと${f.daysLeft}日`}`,
      detail: `締切 ${formatYmd(f.deadline)}。申込が済んでいないクラブに声をかけましょう`,
    });
  }

  const topClubs = data.clubs.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* よく使う操作 */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button asChild variant="outline" className="justify-start">
          <Link href="/district/events"><CalendarPlus />行事を追加</Link>
        </Button>
        <Button asChild variant="outline" className="justify-start">
          <Link href="/district/registrations/new"><ClipboardList />申込フォームを作る</Link>
        </Button>
        <Button asChild variant="outline" className="justify-start">
          <Link href="/district/announcements"><Megaphone />お知らせを配信</Link>
        </Button>
        <Button asChild variant="outline" className="justify-start">
          <Link href="/district/reports"><ClipboardCheck />報告書を審査</Link>
        </Button>
      </div>

      {/* 要対応 */}
      <Section title="要対応" icon={AlertCircle}>
        {todos.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-4 text-sm text-green-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            対応が必要なものはありません
          </div>
        ) : (
          <ul className="space-y-2">
            {todos.map(t => (
              <li key={t.key}>
                <Link href={t.href} className={`flex items-center gap-3 rounded-md border px-3 py-3 transition-opacity hover:opacity-80 ${TONE[t.tone]}`}>
                  <t.icon className="h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold">{t.title}</div>
                    <div className="mt-0.5 break-words text-xs opacity-80">{t.detail}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 数字 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="地区内クラブ数" value={data.clubs.length} unit="クラブ" icon={Building2} href="/district/clubs" />
        <StatTile label="会員数" value={data.memberTotal} unit="人" icon={Users} note="地区内クラブの在籍会員" />
        <StatTile label="今年度の例会数" value={data.meetingTotal} unit="回" icon={ClipboardCheck} note="中止・下書きを除く" />
        <StatTile label="今後の地区行事" value={data.upcomingEventCount} unit="件" icon={CalendarDays} href="/district/events" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 今後の地区行事 */}
        <Section title="今後の地区行事" icon={CalendarDays} action={{ href: '/district/events', label: '行事一覧' }}>
          {data.upcomingEvents.length === 0 ? (
            <EmptyText>予定されている地区行事はありません。「行事を追加」から登録できます。</EmptyText>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.upcomingEvents.map(e => (
                <li key={e.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-16 shrink-0 rounded-md bg-indigo-50 px-1 py-1.5 text-center text-xs font-semibold text-indigo-700">
                    {formatMd(e.date)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="break-words font-medium text-gray-900">{e.title}</div>
                    <div className="mt-0.5 break-words text-xs text-gray-500">
                      {e.startTime ? `${e.startTime.slice(0, 5)}〜 ` : ''}
                      {e.venueName || '会場未定'}
                    </div>
                    <div className="mt-1 text-xs">
                      {e.form ? (
                        <Link href={`/district/registrations/${e.form.id}`} className="text-indigo-700 hover:underline">
                          申込 {e.form.registrations}件・参加者 {e.form.attendees}人 →
                        </Link>
                      ) : (
                        <Link href={`/district/registrations/new?eventId=${encodeURIComponent(e.id)}`} className="text-gray-500 hover:text-indigo-700 hover:underline">
                          ＋ 申込フォームを作る
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 受付中の申込 */}
        <Section title="受付中の申込" icon={ClipboardList} action={{ href: '/district/registrations', label: '申込管理' }}>
          {data.openForms.length === 0 ? (
            <EmptyText>受付中の申込フォームはありません。</EmptyText>
          ) : (
            <ul className="space-y-3">
              {data.openForms.map(f => (
                <li key={f.id}>
                  <Link href={`/district/registrations/${f.id}`} className="block rounded-md border border-gray-200 p-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="break-words font-medium text-gray-900">{f.config.title || '（無題のフォーム）'}</span>
                      <span className="text-xs text-gray-500">締切 {formatYmd(f.config.deadline)}</span>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      申込 <span className="font-semibold text-gray-900">{f.registrations}</span>件・参加者{' '}
                      <span className="font-semibold text-gray-900">{f.attendees}</span>人
                    </div>
                    <div className="mt-2"><PaymentBar total={f.totalAmount} paid={f.paidAmount} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* クラブの状況 */}
      <Section
        title="クラブの状況"
        icon={Building2}
        action={data.clubs.length > 0 ? { href: '/district/clubs', label: 'すべて見る' } : undefined}
      >
        {topClubs.length === 0 ? (
          <EmptyText>この地区にはまだクラブが登録されていません。</EmptyText>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 max-md:border-0">
            <table className="rac-table w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">クラブ名</th>
                  <th className="px-3 py-2 text-right">会員数</th>
                  <th className="px-3 py-2 text-right">今年度例会数</th>
                  <th className="px-3 py-2">直近の例会</th>
                  <th className="px-3 py-2">報告書（承認/提出）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topClubs.map(c => (
                  <tr key={c.id}>
                    <td data-cell="primary" className="px-3 py-2">
                      <Link href={`/district/clubs/${c.id}`} className="rac-row-link font-medium text-indigo-700 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td data-label="会員数" className="px-3 py-2 md:text-right">{c.stats.memberCount}人</td>
                    <td data-label="今年度例会数" className="px-3 py-2 md:text-right">{c.stats.meetingCount}回</td>
                    <td data-label="直近の例会" className="px-3 py-2">{c.stats.lastMeetingDate ? formatYmd(c.stats.lastMeetingDate) : 'まだありません'}</td>
                    <td data-label="報告書" className="px-3 py-2">{c.stats.reportsApproved} / {c.stats.reportsSubmitted}件</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.clubs.length > topClubs.length && (
          <div className="mt-3 text-right text-sm">
            <Link href="/district/clubs" className="text-indigo-700 hover:underline">
              ほか {data.clubs.length - topClubs.length}クラブ・すべて見る →
            </Link>
          </div>
        )}
      </Section>

      {/* お知らせ */}
      <Section title="地区からのお知らせ" icon={Bell} action={{ href: '/district/announcements', label: 'お知らせ管理' }}>
        {data.announcements.length === 0 ? (
          <EmptyText>公開中のお知らせはありません。「お知らせを配信」からクラブへ連絡できます。</EmptyText>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.announcements.map(a => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                {a.pinned && <Badge variant="info">固定</Badge>}
                {LEVEL_BADGE[a.level]}
                <Link href="/district/announcements" className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900 hover:text-indigo-700">
                  {a.title}
                </Link>
                <span className="text-xs text-gray-500">{formatYmd(a.publishFrom || a.createdAt, false)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
