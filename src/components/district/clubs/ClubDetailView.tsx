/**
 * クラブ詳細（地区役員用・閲覧のみ）
 * クラブ情報 → 数字 → 会員 → 例会 → 地区への提出 → 行事の申込 の順に表示する
 */
import Link from 'next/link';
import {
  ArrowLeft, Building2, CalendarDays, Camera, ClipboardCheck, ClipboardList, ExternalLink, FileText, Mail,
  User, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ClubDetail } from '@/lib/district/stats';
import { MEMBER_TYPE_LABELS, USER_ROLE_LABELS, type MemberType, type UserRole } from '@/types';
import { formatYmd, yen } from '../dashboard/format';
import {
  EmptyText, InstagramStatusBadge, MeetingStatusBadge, PaymentStatusBadge, ReportStatusBadge, Section, StatTile,
} from '../dashboard/parts';

const CLUB_TYPE_LABELS: Record<string, string> = {
  RAC: 'ローターアクトクラブ',
  RC: 'ロータリークラブ',
};
const REPORT_TYPE_LABELS: Record<string, string> = { meeting: '例会報告', activity: '活動報告', other: 'その他' };
const POST_TYPE_LABELS: Record<string, string> = { before: '告知', after: '開催報告', other: 'その他' };

function MemberStatus({ status, isActive }: { status: string; isActive: boolean }) {
  if (status === 'pending') return <Badge variant="warning">承認待ち</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">否認</Badge>;
  if (!isActive) return <Badge variant="secondary">休会・退会</Badge>;
  return <Badge variant="success">在籍</Badge>;
}

export default function ClubDetailView({ detail, yearLabel }: { detail: ClubDetail; yearLabel: string }) {
  const { club, stats, members, meetings, reports, instagram, registrations } = detail;
  const pendingReports = reports.filter(r => r.status === 'submitted').length;
  const pendingIg = instagram.filter(p => p.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/district/clubs" className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          クラブ一覧へ戻る
        </Link>
        <h1 className="mt-2 break-words text-2xl font-bold text-gray-900">{club.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{yearLabel}の状況（閲覧のみ）</p>
      </div>

      {/* クラブ情報 */}
      <Section title="クラブ情報" icon={Building2}>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-gray-500">クラブ名</dt>
            <dd className="break-words text-gray-900">{club.name}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-gray-500">略称</dt>
            <dd className="break-words text-gray-900">{club.shortName || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-gray-500">種別</dt>
            <dd className="text-gray-900">
              {CLUB_TYPE_LABELS[club.type] ?? club.type}
              {!club.isActive && <Badge variant="secondary" className="ml-2">休止中</Badge>}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-gray-500">担当者</dt>
            <dd className="flex items-center gap-1 break-words text-gray-900">
              <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              {club.contactName || '未登録'}
            </dd>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-gray-500">メールアドレス</dt>
            <dd className="flex min-w-0 items-center gap-1 text-gray-900">
              <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              {club.email ? (
                <a href={`mailto:${club.email}`} className="break-all text-indigo-700 hover:underline">{club.email}</a>
              ) : '未登録'}
            </dd>
          </div>
        </dl>
      </Section>

      {/* 数字 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="会員数" value={stats.memberCount} unit="人" icon={Users} />
        <StatTile
          label="今年度の例会数" value={stats.meetingCount} unit="回" icon={CalendarDays}
          note={stats.lastMeetingDate ? `直近 ${formatYmd(stats.lastMeetingDate)}` : '開催済みの例会はまだありません'}
        />
        <StatTile
          label="平均参加人数" value={stats.avgAttendance ?? '—'} unit={stats.avgAttendance === null ? undefined : '人'}
          icon={ClipboardCheck} note="自クラブ会員の出席（開催済み例会）"
        />
        <StatTile
          label="Instagram" value={stats.instagramScore} unit="点" icon={Camera}
          note={`承認 ${stats.instagramApproved}件／報告書 承認${stats.reportsApproved}・提出${stats.reportsSubmitted}`}
        />
      </div>

      {/* 会員一覧 */}
      <Section title={`会員一覧（${members.length}人）`} icon={Users}>
        {members.length === 0 ? (
          <EmptyText>登録されている会員はいません。</EmptyText>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 max-md:border-0">
            <table className="rac-table w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">氏名</th>
                  <th className="px-3 py-2">役職</th>
                  <th className="px-3 py-2">権限</th>
                  <th className="px-3 py-2">会員種別</th>
                  <th className="px-3 py-2">状態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map(m => (
                  <tr key={m.id}>
                    <td data-cell="primary" className="px-3 py-2">
                      <div className="font-medium text-gray-900">{m.name}</div>
                      {m.nameKana && <div className="text-xs font-normal text-gray-500">{m.nameKana}</div>}
                    </td>
                    <td data-label="役職" className="px-3 py-2">{m.position || <span className="text-gray-400">—</span>}</td>
                    <td data-label="権限" className="px-3 py-2">{USER_ROLE_LABELS[m.role as UserRole] ?? m.role}</td>
                    <td data-label="会員種別" className="px-3 py-2">{MEMBER_TYPE_LABELS[m.memberType as MemberType] ?? m.memberType}</td>
                    <td data-label="状態" className="px-3 py-2"><MemberStatus status={m.status} isActive={m.isActive} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 今年度の例会 */}
      <Section title={`今年度の例会（${meetings.length}件）`} icon={CalendarDays}>
        {meetings.length === 0 ? (
          <EmptyText>今年度の例会はまだ登録されていません。</EmptyText>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 max-md:border-0">
            <table className="rac-table w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">日付</th>
                  <th className="px-3 py-2">例会名</th>
                  <th className="px-3 py-2">状態</th>
                  <th className="px-3 py-2 text-right">参加人数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {meetings.map(m => (
                  <tr key={m.id} className={m.status === 'cancelled' ? 'text-gray-400' : ''}>
                    <td data-label="日付" className="whitespace-nowrap px-3 py-2">{formatYmd(m.date)}</td>
                    <td data-cell="primary" className="px-3 py-2">
                      <span className="break-words font-medium">
                        {m.meetingNumber && !m.title.includes(String(m.meetingNumber)) ? `第${m.meetingNumber}回 ` : ''}
                        {m.title}
                      </span>
                    </td>
                    <td data-label="状態" className="px-3 py-2"><MeetingStatusBadge status={m.status} /></td>
                    <td data-label="参加人数" className="px-3 py-2 md:text-right">{m.status === 'cancelled' ? '—' : `${m.present}人`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">参加人数は、このクラブの会員で「出席」になっている人数です。</p>
      </Section>

      {/* 地区への提出 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="報告書"
          icon={FileText}
          action={pendingReports > 0 ? { href: '/district/reports', label: `審査待ち ${pendingReports}件` } : undefined}
        >
          {reports.length === 0 ? (
            <EmptyText>このクラブから提出された報告書はまだありません。</EmptyText>
          ) : (
            <ul className="divide-y divide-gray-100">
              {reports.map(r => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                  <ReportStatusBadge status={r.status} />
                  <span className="min-w-0 flex-1 break-words text-sm text-gray-900">{r.title}</span>
                  <span className="text-xs text-gray-500">
                    {REPORT_TYPE_LABELS[r.reportType] ?? r.reportType}・{formatYmd(r.submittedAt || r.createdAt, false)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Instagram"
          icon={Camera}
          action={pendingIg > 0 ? { href: '/district/instagram', label: `審査待ち ${pendingIg}件` } : undefined}
        >
          {instagram.length === 0 ? (
            <EmptyText>このクラブから提出されたInstagram投稿はまだありません。</EmptyText>
          ) : (
            <ul className="divide-y divide-gray-100">
              {instagram.map(p => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                  <InstagramStatusBadge status={p.status} />
                  <span className="min-w-0 flex-1 text-sm text-gray-900">
                    {POST_TYPE_LABELS[p.postType] ?? p.postType}
                    {p.postUrl && /^https?:\/\//.test(p.postUrl) && (
                      <a
                        href={p.postUrl} target="_blank" rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-0.5 text-xs text-indigo-700 hover:underline"
                      >
                        投稿を見る<ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">
                    {p.status === 'approved' ? `${p.score}点・` : ''}{formatYmd(p.submittedAt || p.createdAt, false)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* 行事の申込 */}
      <Section title="行事の申込" icon={ClipboardList}>
        {registrations.length === 0 ? (
          <EmptyText>このクラブからの行事の申込はまだありません。</EmptyText>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 max-md:border-0">
            <table className="rac-table w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">行事</th>
                  <th className="px-3 py-2 text-right">人数</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2">入金状況</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {registrations.map(r => {
                  const cancelled = r.status === 'cancelled';
                  return (
                    <tr key={r.id} className={cancelled ? 'text-gray-400' : ''}>
                      <td data-cell="primary" className="px-3 py-2">
                        <Link href={`/district/registrations/${r.formId}`} className={`font-medium hover:underline ${cancelled ? 'line-through' : 'text-indigo-700'}`}>
                          {r.formTitle}
                        </Link>
                        {r.eventDate && <div className="text-xs font-normal text-gray-500">{formatYmd(r.eventDate)}</div>}
                      </td>
                      <td data-label="人数" className="px-3 py-2 md:text-right">{r.attendeeCount}人</td>
                      <td data-label="金額" className="px-3 py-2 md:text-right">
                        {yen(r.totalAmount)}
                        {r.paidAmount > 0 && r.paidAmount < r.totalAmount && (
                          <div className="text-xs text-gray-500">入金 {yen(r.paidAmount)}</div>
                        )}
                      </td>
                      <td data-label="入金状況" className="px-3 py-2">
                        {cancelled ? <Badge variant="secondary">取消</Badge> : <PaymentStatusBadge status={r.paymentStatus} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
