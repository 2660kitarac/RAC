'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Calendar, MapPin, Users, Clock, Edit, ExternalLink,
  FileText, Mail, DollarSign, ArrowLeft, Copy, CheckCircle, Share2,
  Search, Download, ChevronUp, ChevronDown
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
import QrCodeModal from '@/components/ui/QrCodeModal';

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

const MEMBER_TYPE_LABELS: Record<string, string> = {
  RAC: 'RAC',
  RC: 'RC（ロータリアン）',
  OBOG: 'OB・OG',
  guest: 'ゲスト',
  external: '外部',
};

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: '出席',
  absent:  '欠席',
  undecided: '未回答',
};

const PARTICIPATION_TYPE_LABELS: Record<string, string> = {
  meeting_only:        '例会のみ',
  meeting_and_party:   '例会＋懇親会',
  absent:              '欠席',
  waitlist:            'キャンセル待ち',
};

export default function MeetingDetail({
  meeting, attendances, stats, report, userRole
}: MeetingDetailProps) {
  const canManage = canManageMeetings(userRole);
  const canFinance = canManageFinance(userRole);

  // 参加者名簿フィルター
  const [nameSearch, setNameSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sortKey, setSortKey] = useState<'name' | 'status' | 'payment' | 'fee'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // 出席ステータス・支払一括管理
  const [localAttendances, setLocalAttendances] = useState<any[]>(attendances as any[]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // 個別ステータス更新
  const updateAttendanceField = async (id: string, field: string, value: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/attendances/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
      setLocalAttendances(prev =>
        prev.map(a => a.id === id ? { ...a, [field]: value } : a)
      );
      toast.success('更新しました');
    } catch {
      toast.error('更新に失敗しました');
    } finally {
      setUpdatingId(null);
    }
  };

  // 一括支払済み処理
  const bulkMarkPaid = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`/api/attendances/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentStatus: 'paid', paidAt: new Date().toISOString() }),
          })
        )
      );
      setLocalAttendances(prev =>
        prev.map(a => selectedIds.has(a.id) ? { ...a, payment_status: 'paid', paidAt: new Date().toISOString() } : a)
      );
      toast.success(`${selectedIds.size}件を支払済みにしました`);
      setSelectedIds(new Set());
    } catch {
      toast.error('一括更新に失敗しました');
    } finally {
      setBulkLoading(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URLをコピーしました');
  };

  // CSV出力
  const exportCSV = () => {
    const rows = [
      ['氏名', '所属', '区分', '参加形式', '出席状況', '支払状況', '登録料', '備考'],
      ...attendances.map(a => [
        (a as any).display_name || (a as any).user_name || (a as any).external_name || '',
        (a as any).club_name || '',
        MEMBER_TYPE_LABELS[(a as any).member_type] || (a as any).member_type || '',
        PARTICIPATION_TYPE_LABELS[(a as any).participation_type || 'meeting_only'] || '',
        ATTENDANCE_STATUS_LABELS[(a as any).attendance_status] || '',
        (a as any).payment_status === 'paid' ? '支払済' : '未払い',
        String((a as any).fee_amount ?? 0),
        (a as any).note || '',
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `参加者名簿_${meeting.title}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // フィルター & ソート
  const filteredAttendances = localAttendances
    .filter(a => {
      const name = (a as any).display_name || (a as any).user_name || (a as any).external_name || '';
      const club = (a as any).club_name || '';
      const matchName = !nameSearch || name.includes(nameSearch) || club.includes(nameSearch);
      const matchStatus = statusFilter === 'all' || (a as any).attendance_status === statusFilter;
      const matchPayment = paymentFilter === 'all' || (a as any).payment_status === paymentFilter;
      return matchName && matchStatus && matchPayment;
    })
    .sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortKey === 'name') {
        va = (a as any).display_name || ''; vb = (b as any).display_name || '';
      } else if (sortKey === 'status') {
        va = (a as any).attendance_status || ''; vb = (b as any).attendance_status || '';
      } else if (sortKey === 'payment') {
        va = (a as any).payment_status || ''; vb = (b as any).payment_status || '';
      } else if (sortKey === 'fee') {
        va = (a as any).fee_amount ?? 0; vb = (b as any).fee_amount ?? 0;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k
      ? (sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />)
      : null;

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

      {/* MU登録URL（タブ外・常時表示） */}
      {meeting.mu_registration_url && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-blue-200 bg-blue-50">
          <ExternalLink className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <span className="text-sm font-medium text-blue-700 flex-shrink-0">MU登録URL</span>
          <code className="flex-1 text-sm bg-white px-3 py-1.5 rounded border border-blue-200 text-blue-800 truncate min-w-0">
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
          <QrCodeModal url={meeting.mu_registration_url} label="MU登録QRコード" />
          <a href={meeting.mu_registration_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100 flex-shrink-0">
              <ExternalLink className="h-4 w-4" />
              開く
            </Button>
          </a>
        </div>
      )}

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

        {/* 出席管理タブ（参加者名簿） */}
        <TabsContent value="attendances" className="mt-4 space-y-3">

          {/* サマリーバー */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-center">
              <p className="text-xs text-blue-600">登録</p>
              <p className="text-lg font-bold text-blue-700">{localAttendances.length}名</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-center">
              <p className="text-xs text-green-600">出席</p>
              <p className="text-lg font-bold text-green-700">
                {localAttendances.filter(a => a.attendance_status === 'present').length}名
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-center">
              <p className="text-xs text-red-600">欠席</p>
              <p className="text-lg font-bold text-red-700">
                {localAttendances.filter(a => a.attendance_status === 'absent').length}名
              </p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5 text-center">
              <p className="text-xs text-orange-600">未払い</p>
              <p className="text-lg font-bold text-orange-700">
                {localAttendances.filter(a => a.payment_status === 'unpaid').length}名
              </p>
            </div>
          </div>

          {/* 操作バー */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={nameSearch}
                onChange={e => setNameSearch(e.target.value)}
                placeholder="氏名・クラブで検索..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-md px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="all">出席：すべて</option>
              <option value="present">出席のみ</option>
              <option value="absent">欠席のみ</option>
              <option value="undecided">未回答のみ</option>
            </select>
            <select
              value={paymentFilter}
              onChange={e => setPaymentFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-md px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="all">支払：すべて</option>
              <option value="paid">支払済のみ</option>
              <option value="unpaid">未払いのみ</option>
            </select>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500">{filteredAttendances.length}名表示</span>
              <Button size="sm" variant="outline" onClick={exportCSV}>
                <Download className="h-4 w-4" />
                CSV
              </Button>
              <Link href={`/meetings/${meeting.id}/attendances`}>
                <Button size="sm">
                  <Users className="h-4 w-4" />
                  出席管理
                </Button>
              </Link>
            </div>
          </div>

          {/* 一括操作バー（選択時のみ表示） */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-sm font-medium text-blue-800">{selectedIds.size}件選択中</span>
              <Button
                size="sm"
                onClick={bulkMarkPaid}
                loading={bulkLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                ✓ 一括支払済みにする
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const unpaidIds = filteredAttendances.filter(a => (a as any).attendance_status !== 'present').map(a => (a as any).id);
                  Promise.all(unpaidIds.map(id =>
                    fetch(`/api/attendances/${id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ attendanceStatus: 'present' }),
                    })
                  )).then(() => {
                    setLocalAttendances(prev =>
                      prev.map(a => selectedIds.has(a.id) ? { ...a, attendance_status: 'present' } : a)
                    );
                    toast.success(`${selectedIds.size}件を出席にしました`);
                    setSelectedIds(new Set());
                  });
                }}
                className="border-green-300 text-green-700 hover:bg-green-50"
              >
                ✓ 一括出席にする
              </Button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-blue-600 hover:text-blue-800 ml-auto"
              >
                選択解除
              </button>
            </div>
          )}

          {/* 名簿テーブル */}
          <Card>
            <CardContent className="p-0">
              {attendances.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Users className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">まだ登録者はいません</p>
                </div>
              ) : filteredAttendances.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">条件に一致する参加者がいません</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-2 py-2.5 w-8">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-blue-600"
                            checked={selectedIds.size === filteredAttendances.length && filteredAttendances.length > 0}
                            onChange={e => {
                              if (e.target.checked) setSelectedIds(new Set(filteredAttendances.map(a => (a as any).id)));
                              else setSelectedIds(new Set());
                            }}
                          />
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort('name')}>
                          氏名 <SortIcon k="name" />
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">所属</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">区分</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">参加形式</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort('status')}>
                          出席 <SortIcon k="status" />
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort('payment')}>
                          支払 <SortIcon k="payment" />
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none" onClick={() => toggleSort('fee')}>
                          登録料 <SortIcon k="fee" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredAttendances.map((attendance, idx) => {
                        const a = attendance as any;
                        const displayName = a.display_name || a.user_name || a.external_name || '（名前なし）';
                        const isExternal = !a.user_id;
                        const isUpdating = updatingId === a.id;
                        const participationColor: Record<string, string> = {
                          meeting_only: 'bg-blue-100 text-blue-700',
                          meeting_and_party: 'bg-purple-100 text-purple-700',
                          party_only: 'bg-pink-100 text-pink-700',
                          absent: 'bg-gray-100 text-gray-500',
                          waitlist: 'bg-yellow-100 text-yellow-700',
                        };
                        return (
                          <tr key={a.id} className={`transition-colors ${isUpdating ? 'bg-blue-50' : selectedIds.has(a.id) ? 'bg-blue-50/60' : idx % 2 === 1 ? 'bg-gray-50/40 hover:bg-blue-50/30' : 'hover:bg-blue-50/30'}`}>
                            <td className="px-2 py-2.5">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-blue-600"
                                checked={selectedIds.has(a.id)}
                                onChange={e => {
                                  const next = new Set(selectedIds);
                                  if (e.target.checked) next.add(a.id); else next.delete(a.id);
                                  setSelectedIds(next);
                                }}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-gray-900">{displayName}</span>
                                {isExternal && (
                                  <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">外部</span>
                                )}
                              </div>
                              {a.note && (
                                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]" title={a.note}>{a.note}</p>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 text-xs">{a.club_name || '-'}</td>
                            <td className="px-3 py-2.5">
                              <Badge variant="secondary" className="text-xs">
                                {MEMBER_TYPE_LABELS[a.member_type] || a.member_type || '-'}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge className={`text-xs ${participationColor[a.participation_type || 'meeting_only'] || 'bg-gray-100 text-gray-500'}`}>
                                {PARTICIPATION_TYPE_LABELS[a.participation_type || 'meeting_only'] || '-'}
                              </Badge>
                            </td>
                            {/* 出席ステータス インライン変更 */}
                            <td className="px-2 py-2">
                              <select
                                value={a.attendance_status || 'undecided'}
                                disabled={isUpdating}
                                onChange={e => updateAttendanceField(a.id, 'attendanceStatus', e.target.value)}
                                className={`text-xs rounded-full px-2 py-1 border-0 font-medium cursor-pointer focus:ring-2 focus:ring-blue-300 focus:outline-none ${
                                  a.attendance_status === 'present' ? 'bg-green-100 text-green-700' :
                                  a.attendance_status === 'absent'  ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}
                              >
                                <option value="undecided">未回答</option>
                                <option value="present">出席</option>
                                <option value="absent">欠席</option>
                              </select>
                            </td>
                            {/* 支払ステータス インライン変更 */}
                            <td className="px-2 py-2">
                              <select
                                value={a.payment_status || 'unpaid'}
                                disabled={isUpdating}
                                onChange={e => updateAttendanceField(a.id, 'paymentStatus', e.target.value)}
                                className={`text-xs rounded-full px-2 py-1 border-0 font-medium cursor-pointer focus:ring-2 focus:ring-blue-300 focus:outline-none ${
                                  a.payment_status === 'paid'   ? 'bg-green-100 text-green-700' :
                                  a.payment_status === 'exempt' ? 'bg-blue-100 text-blue-700' :
                                  'bg-red-100 text-red-700'
                                }`}
                              >
                                <option value="unpaid">未払い</option>
                                <option value="paid">支払済</option>
                                <option value="exempt">免除</option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">
                              {formatCurrency(a.fee_amount ?? 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* 合計行 */}
                    {filteredAttendances.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50">
                          <td colSpan={7} className="px-3 py-2 text-xs font-medium text-gray-600 text-right">
                            合計 {filteredAttendances.length}名
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-bold text-gray-800 tabular-nums">
                            {formatCurrency(filteredAttendances.reduce((s, a) => s + ((a as any).fee_amount ?? 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
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
