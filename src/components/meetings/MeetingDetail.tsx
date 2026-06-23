'use client';

import Link from 'next/link';
import {
  Calendar, MapPin, Users, Clock, Edit, ExternalLink,
  FileText, Mail, DollarSign, ArrowLeft, Copy, CheckCircle, Share2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatCurrency, formatTime } from '@/lib/utils';
import type { Meeting, Attendance, MeetingReport, UserRole } from '@/types';
import { MEETING_STATUS_LABELS, MEETING_STATUS_COLORS, MeetingStatus } from '@/types';
import { canManageMeetings, canManageFinance } from '@/lib/hooks/useAuth';
import { toast } from 'sonner';

interface MeetingDetailProps {
  meeting: Meeting;
  attendances: Attendance[];
  stats: {
    totalAttendances: number;
    presentCount: number;
    unpaidCount: number;
    paidAmount: number;
    incomeTotal: number;
    expenseTotal: number;
  };
  report: MeetingReport | null;
  userRole: UserRole;
}

export default function MeetingDetail({
  meeting, attendances, stats, report, userRole
}: MeetingDetailProps) {
  const canManage = canManageMeetings(userRole);
  const canFinance = canManageFinance(userRole);

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URLをコピーしました');
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/meetings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              戻る
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
              <Badge className={MEETING_STATUS_COLORS[meeting.status as MeetingStatus]}>
                {MEETING_STATUS_LABELS[meeting.status as MeetingStatus]}
              </Badge>
            </div>
            {meeting.meeting_number && (
              <p className="text-sm text-gray-500 mt-0.5">第{meeting.meeting_number}例会</p>
            )}
          </div>
        </div>
        {canManage && (
          <Link href={`/meetings/${meeting.id}/edit`}>
            <Button variant="outline" size="sm">
              <Edit className="h-4 w-4" />
              編集
            </Button>
          </Link>
        )}
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="登録者数" value={`${stats.totalAttendances}名`} color="blue" />
        <StatCard title="出席予定" value={`${stats.presentCount}名`} color="green" />
        <StatCard
          title="未払い"
          value={`${stats.unpaidCount}名`}
          color={stats.unpaidCount > 0 ? 'red' : 'green'}
        />
        <StatCard title="収支" value={formatCurrency(stats.incomeTotal - stats.expenseTotal)} color="blue" />
      </div>

      <Tabs defaultValue="info">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="info">基本情報</TabsTrigger>
          <TabsTrigger value="attendances">出席管理</TabsTrigger>
          <TabsTrigger value="finance">収支</TabsTrigger>
          <TabsTrigger value="report">報告書</TabsTrigger>
        </TabsList>

        {/* 基本情報タブ */}
        <TabsContent value="info" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  開催情報
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="開催日" value={formatDate(meeting.date)} />
                {(meeting.start_time || meeting.end_time) && (
                  <InfoRow
                    label="時間"
                    value={`${formatTime(meeting.start_time)} 〜 ${formatTime(meeting.end_time)}`}
                  />
                )}
                {meeting.venue_name && (
                  <InfoRow label="会場" value={meeting.venue_name} />
                )}
                {meeting.venue_address && (
                  <InfoRow label="住所" value={meeting.venue_address} />
                )}
                {meeting.committee && (
                  <InfoRow label="担当委員会" value={meeting.committee} />
                )}
                {meeting.registration_deadline && (
                  <InfoRow label="登録締切" value={formatDate(meeting.registration_deadline)} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  登録料
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="RAC" value={formatCurrency(meeting.fee_rac)} />
                <InfoRow label="RC（ロータリアン）" value={formatCurrency(meeting.fee_rc)} />
                <InfoRow label="OB・OG" value={formatCurrency(meeting.fee_obog)} />
                <InfoRow label="ゲスト" value={formatCurrency(meeting.fee_guest)} />
                {meeting.meal_fee > 0 && (
                  <InfoRow label="お弁当代" value={formatCurrency(meeting.meal_fee)} />
                )}
              </CardContent>
            </Card>

            {meeting.theme && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">例会テーマ</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700">{meeting.theme}</p>
                </CardContent>
              </Card>
            )}

            {meeting.description && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">例会内容</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap text-sm">{meeting.description}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* MU登録URL */}
          {meeting.mu_registration_url && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                  <ExternalLink className="h-4 w-4" />
                  MU登録URL
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="flex-1 text-sm bg-white px-3 py-2 rounded border border-blue-200 text-blue-800 truncate">
                    {meeting.mu_registration_url}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyUrl(meeting.mu_registration_url!)}
                    className="border-blue-300 text-blue-700 hover:bg-blue-100 flex-shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                    コピー
                  </Button>
                  <a href={meeting.mu_registration_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100">
                      <ExternalLink className="h-4 w-4" />
                      開く
                    </Button>
                  </a>
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  ※このURLを外部参加者に共有してください
                </p>
              </CardContent>
            </Card>
          )}

          {/* アクションボタン */}
          <div className="flex flex-wrap gap-3">
            <Link href={`/meetings/${meeting.id}/attendances`}>
              <Button variant="outline">
                <Users className="h-4 w-4" />
                出席管理
              </Button>
            </Link>
            <Link href={`/emails/compose?meeting_id=${meeting.id}`}>
              <Button variant="outline">
                <Mail className="h-4 w-4" />
                メール作成
              </Button>
            </Link>
            {!report && (
              <Link href={`/meetings/${meeting.id}/report`}>
                <Button variant="outline">
                  <FileText className="h-4 w-4" />
                  報告書作成
                </Button>
              </Link>
            )}
          </div>
        </TabsContent>

        {/* 出席管理タブ */}
        <TabsContent value="attendances" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">出席者一覧</CardTitle>
              <Link href={`/meetings/${meeting.id}/attendances`}>
                <Button size="sm">
                  <Users className="h-4 w-4" />
                  出席管理を開く
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {attendances.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">
                  まだ登録者はいません
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">氏名</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">所属</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">区分</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">出席</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">支払</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {attendances.slice(0, 10).map(attendance => (
                        <tr key={attendance.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">
                            {attendance.user?.name || attendance.external_name}
                          </td>
                          <td className="px-3 py-2 text-gray-600 text-xs">
                            {attendance.club_name || '-'}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className="text-xs">
                              {attendance.member_type}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              className={
                                attendance.attendance_status === 'present'
                                  ? 'bg-green-100 text-green-700'
                                  : attendance.attendance_status === 'absent'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-600'
                              }
                            >
                              {attendance.attendance_status === 'present' ? '出席' :
                               attendance.attendance_status === 'absent' ? '欠席' : '未回答'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              className={
                                attendance.payment_status === 'paid'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }
                            >
                              {attendance.payment_status === 'paid' ? '支払済' : '未払い'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {attendances.length > 10 && (
                    <p className="text-center text-sm text-gray-500 py-2">
                      他 {attendances.length - 10}件...
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 収支タブ */}
        <TabsContent value="finance" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="収入合計" value={formatCurrency(stats.incomeTotal)} color="green" large />
            <StatCard title="支出合計" value={formatCurrency(stats.expenseTotal)} color="red" large />
            <StatCard
              title="差引収支"
              value={formatCurrency(stats.incomeTotal - stats.expenseTotal)}
              color={stats.incomeTotal >= stats.expenseTotal ? 'blue' : 'orange'}
              large
            />
          </div>
          {canFinance && (
            <div className="mt-4 flex gap-3">
              <Link href={`/finance/transactions?meeting_id=${meeting.id}`}>
                <Button variant="outline">
                  <DollarSign className="h-4 w-4" />
                  収支詳細を見る
                </Button>
              </Link>
            </div>
          )}
        </TabsContent>

        {/* 報告書タブ */}
        <TabsContent value="report" className="mt-4">
          {report ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{report.title}</CardTitle>
                <Link href={`/meetings/${meeting.id}/report`}>
                  <Button size="sm" variant="outline">
                    <Edit className="h-4 w-4" />
                    編集
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                  {report.report_body || report.summary}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="empty-state">
              <FileText className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-gray-500 mb-4">報告書がまだ作成されていません</p>
              <Link href={`/meetings/${meeting.id}/report`}>
                <Button>
                  <FileText className="h-4 w-4" />
                  AIで報告書を作成
                </Button>
              </Link>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right">{value}</span>
    </div>
  );
}

function StatCard({
  title, value, color, large
}: {
  title: string; value: string; color: string; large?: boolean;
}) {
  const colors: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-gray-500 mb-1">{title}</p>
        <p className={`font-bold ${large ? 'text-2xl' : 'text-xl'} ${colors[color]}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
