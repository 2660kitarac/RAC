'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import {
  Search, ArrowLeft, Download, Users, DollarSign,
  CheckCircle, XCircle, Clock, Smartphone, PartyPopper, Hourglass, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, formatCurrency, exportToCSV } from '@/lib/utils';
import type { Meeting, Attendance, UserRole, AttendanceStatus, PaymentStatus } from '@/types';
import {
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_COLORS,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  MEMBER_TYPE_LABELS
} from '@/types';

const PARTICIPATION_LABELS: Record<string, string> = {
  meeting_only: '例会のみ',
  meeting_and_party: '例会＋懇親会',
  absent: '欠席',
  waitlist: 'キャンセル待ち',
};

const PARTICIPATION_COLORS: Record<string, string> = {
  meeting_only: 'bg-blue-100 text-blue-700',
  meeting_and_party: 'bg-purple-100 text-purple-700',
  absent: 'bg-red-100 text-red-700',
  waitlist: 'bg-yellow-100 text-yellow-700',
};

interface AttendanceManagementProps {
  meeting: Meeting;
  initialAttendances: Attendance[];
  userRole: UserRole;
}

export default function AttendanceManagement({
  meeting, initialAttendances, userRole
}: AttendanceManagementProps) {
  const [attendances, setAttendances] = useState(initialAttendances);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [memberTypeFilter, setMemberTypeFilter] = useState<string>('all');
  const [participationFilter, setParticipationFilter] = useState<string>('all');
  const [loading, setLoading] = useState<string | null>(null);
  const [receptionMode, setReceptionMode] = useState(false);

  const filtered = useMemo(() => {
    return attendances.filter(a => {
      const name = (a as any).user?.name || (a as any).external_name || '';
      const club = (a as any).club_name || '';
      const matchSearch = !searchQuery ||
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        club.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'all' || (a as any).attendance_status === statusFilter;
      const matchPayment = paymentFilter === 'all' || (a as any).payment_status === paymentFilter;
      const matchType = memberTypeFilter === 'all' || (a as any).member_type === memberTypeFilter;
      const pType = (a as any).participation_type || (a as any).participationType || 'meeting_only';
      const matchParticipation = participationFilter === 'all' || pType === participationFilter;
      return matchSearch && matchStatus && matchPayment && matchType && matchParticipation;
    });
  }, [attendances, searchQuery, statusFilter, paymentFilter, memberTypeFilter, participationFilter]);

  const stats = useMemo(() => {
    const active = attendances.filter(a => {
      const pt = (a as any).participation_type || (a as any).participationType || 'meeting_only';
      return pt !== 'absent' && pt !== 'waitlist';
    });
    return {
      total: active.length,
      present: attendances.filter(a => (a as any).attendance_status === 'present').length,
      absent: attendances.filter(a => {
        const pt = (a as any).participation_type || (a as any).participationType;
        return pt === 'absent';
      }).length,
      waitlist: attendances.filter(a => {
        const pt = (a as any).participation_type || (a as any).participationType;
        return pt === 'waitlist';
      }).length,
      withParty: attendances.filter(a => {
        const pt = (a as any).participation_type || (a as any).participationType;
        return pt === 'meeting_and_party';
      }).length,
      unpaid: attendances.filter(a => (a as any).payment_status === 'unpaid' && (a as any).participation_type !== 'absent').length,
      paidAmount: attendances.filter(a => (a as any).payment_status === 'paid').reduce((sum, a) => sum + ((a as any).fee_amount || 0) + ((a as any).after_party_fee_amount || 0), 0),
      totalAmount: active.reduce((sum, a) => sum + ((a as any).fee_amount || 0) + ((a as any).after_party_fee_amount || 0), 0),
    };
  }, [attendances]);

  const hasAfterParty = (meeting as any).has_after_party || (meeting as any).hasAfterParty;

  const updateAttendanceStatus = async (id: string, status: AttendanceStatus) => {
    setLoading(id);
    const res = await fetch(`/api/attendances/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceStatus: status }),
    });
    if (!res.ok) {
      toast.error('更新に失敗しました');
    } else {
      setAttendances(prev => prev.map(a => (a as any).id === id ? { ...a, attendance_status: status } : a));
      toast.success('出席状況を更新しました');
    }
    setLoading(null);
  };

  const updatePaymentStatus = async (id: string, status: PaymentStatus) => {
    setLoading(id);
    const attendance = attendances.find(a => (a as any).id === id);
    const res = await fetch(`/api/attendances/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentStatus: status,
        paidAt: status === 'paid' ? new Date().toISOString() : null,
      }),
    });
    if (!res.ok) {
      toast.error('更新に失敗しました');
    } else {
      setAttendances(prev => prev.map(a => (a as any).id === id ? {
        ...a, payment_status: status,
        paid_at: status === 'paid' ? new Date().toISOString() : null,
      } : a));
      if (status === 'paid' && attendance) {
        await fetch('/api/finance/create-from-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendanceId: id }),
        }).catch(() => {});
      }
      toast.success('支払状況を更新しました');
    }
    setLoading(null);
  };

  const exportCSV = () => {
    const csvData = filtered.map(a => ({
      '氏名': (a as any).user?.name || (a as any).external_name || '',
      '所属クラブ': (a as any).club_name || '',
      '区分': MEMBER_TYPE_LABELS[(a as any).member_type] || (a as any).member_type,
      '参加形態': PARTICIPATION_LABELS[(a as any).participation_type || (a as any).participationType || 'meeting_only'] || '',
      '出席状況': ATTENDANCE_STATUS_LABELS[(a as any).attendance_status] || '',
      '支払状況': PAYMENT_STATUS_LABELS[(a as any).payment_status] || '',
      '例会費': (a as any).fee_amount || 0,
      '懇親会費': (a as any).after_party_fee_amount || 0,
      '領収書': (a as any).receipt_required ? '希望' : '不要',
      'メモ': (a as any).note || '',
      '登録日時': (a as any).registered_at,
    }));
    exportToCSV(csvData, `出席者一覧_${meeting.title}`);
  };

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Link href={`/meetings/${meeting.id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">出席管理</h1>
            <p className="text-gray-500 text-sm">{meeting.title} / {formatDate(meeting.date)}</p>
            {hasAfterParty && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-600 mt-0.5">
                <PartyPopper className="h-3 w-3" />
                懇親会あり
                {((meeting as any).after_party_venue || (meeting as any).afterPartyVenue) &&
                  `（${(meeting as any).after_party_venue || (meeting as any).afterPartyVenue}）`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={receptionMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setReceptionMode(!receptionMode)}
          >
            <Smartphone className="h-4 w-4" />
            {receptionMode ? '通常表示' : '受付モード'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatChip label="参加予定" value={`${stats.total}名`} color="blue" />
        <StatChip label="出席確認済" value={`${stats.present}名`} color="green" />
        {hasAfterParty && (
          <StatChip label="懇親会参加" value={`${stats.withParty}名`} color="purple" />
        )}
        <StatChip label="未払い" value={`${stats.unpaid}名`} color={stats.unpaid > 0 ? 'red' : 'green'} />
        <StatChip label="入金済額" value={formatCurrency(stats.paidAmount)} color="blue" />
        {stats.waitlist > 0 && (
          <StatChip label="キャンセル待ち" value={`${stats.waitlist}名`} color="yellow" />
        )}
        {stats.absent > 0 && (
          <StatChip label="欠席連絡" value={`${stats.absent}名`} color="gray" />
        )}
      </div>

      {/* フィルター */}
      <Card>
        <CardContent className="p-3">
          <div className={`grid gap-2 ${receptionMode ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-5'}`}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="名前・クラブで検索..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={`pl-9 ${receptionMode ? 'h-12 text-base' : ''}`}
              />
            </div>
            {!receptionMode && (
              <>
                <Select value={participationFilter} onValueChange={setParticipationFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="参加形態" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    {Object.entries(PARTICIPATION_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="出席状況" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    {Object.entries(ATTENDANCE_STATUS_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="支払状況" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="unpaid">未払い</SelectItem>
                    <SelectItem value="paid">支払済</SelectItem>
                    <SelectItem value="exempt">免除</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={memberTypeFilter} onValueChange={setMemberTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="区分" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="RAC">RAC</SelectItem>
                    <SelectItem value="RC">RC</SelectItem>
                    <SelectItem value="OB_OG">OB・OG</SelectItem>
                    <SelectItem value="GUEST">ゲスト</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
          {(searchQuery || statusFilter !== 'all' || paymentFilter !== 'all' || participationFilter !== 'all') && (
            <p className="text-xs text-gray-500 mt-2">{filtered.length}件表示中</p>
          )}
        </CardContent>
      </Card>

      {/* 出席者リスト */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <Users className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500">参加者が見つかりません</p>
        </div>
      ) : (
        <>
          {receptionMode ? (
            <div className="space-y-3">
              {filtered.map(attendance => (
                <ReceptionCard
                  key={(attendance as any).id}
                  attendance={attendance}
                  loading={loading === (attendance as any).id}
                  onAttendanceChange={updateAttendanceStatus}
                  onPaymentChange={updatePaymentStatus}
                  hasAfterParty={hasAfterParty}
                />
              ))}
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">氏名</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">区分</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">参加形態</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">出席確認</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">支払</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">合計金額</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">メモ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(attendance => {
                      const a = attendance as any;
                      const pType = a.participation_type || a.participationType || 'meeting_only';
                      const totalFee = (a.fee_amount || 0) + (a.after_party_fee_amount || 0);
                      return (
                        <tr key={a.id} className={`hover:bg-gray-50 transition-colors ${pType === 'absent' ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{a.user?.name || a.external_name}</p>
                            {a.club_name && <p className="text-xs text-gray-400">{a.club_name}</p>}
                            {a.receipt_required && (
                              <span className="text-xs text-blue-600">領収書希望</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className="text-xs">
                              {MEMBER_TYPE_LABELS[a.member_type] || a.member_type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PARTICIPATION_COLORS[pType] || 'bg-gray-100 text-gray-600'}`}>
                              {pType === 'meeting_and_party' && <PartyPopper className="h-3 w-3" />}
                              {pType === 'absent' && <XCircle className="h-3 w-3" />}
                              {pType === 'waitlist' && <Hourglass className="h-3 w-3" />}
                              {PARTICIPATION_LABELS[pType] || pType}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {pType === 'absent' ? (
                              <span className="text-xs text-gray-400">-</span>
                            ) : (
                              <Select
                                value={a.attendance_status}
                                onValueChange={v => updateAttendanceStatus(a.id, v as AttendanceStatus)}
                              >
                                <SelectTrigger className={`h-8 text-xs w-28 ${ATTENDANCE_STATUS_COLORS[a.attendance_status] || ''}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(ATTENDANCE_STATUS_LABELS).map(([v, l]) => (
                                    <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {pType === 'absent' ? (
                              <span className="text-xs text-gray-400">-</span>
                            ) : (
                              <Select
                                value={a.payment_status}
                                onValueChange={v => updatePaymentStatus(a.id, v as PaymentStatus)}
                              >
                                <SelectTrigger className={`h-8 text-xs w-28 ${PAYMENT_STATUS_COLORS[a.payment_status] || ''}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unpaid" className="text-xs">未払い</SelectItem>
                                  <SelectItem value="paid" className="text-xs">支払済</SelectItem>
                                  <SelectItem value="exempt" className="text-xs">免除</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {pType !== 'absent' ? formatCurrency(totalFee) : '-'}
                            {a.after_party_fee_amount > 0 && (
                              <div className="text-xs text-purple-600">
                                (懇親会 {formatCurrency(a.after_party_fee_amount)})
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-32">
                            {a.note && <span title={a.note}>{a.note.length > 20 ? a.note.substring(0, 20) + '…' : a.note}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-sm font-medium text-gray-700">
                        参加 {filtered.filter(a => {
                          const pt = (a as any).participation_type || (a as any).participationType;
                          return pt !== 'absent' && pt !== 'waitlist';
                        }).length}名
                        {stats.waitlist > 0 && ` / キャンセル待ち ${stats.waitlist}名`}
                      </td>
                      <td className="px-4 py-2 font-bold text-gray-900">
                        {formatCurrency(filtered.reduce((sum, a) => {
                          const pt = (a as any).participation_type || (a as any).participationType;
                          if (pt === 'absent') return sum;
                          return sum + ((a as any).fee_amount || 0) + ((a as any).after_party_fee_amount || 0);
                        }, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// 受付モード用カード
function ReceptionCard({
  attendance, loading, onAttendanceChange, onPaymentChange, hasAfterParty
}: {
  attendance: any;
  loading: boolean;
  hasAfterParty: boolean;
  onAttendanceChange: (id: string, status: AttendanceStatus) => void;
  onPaymentChange: (id: string, status: PaymentStatus) => void;
}) {
  const a = attendance;
  const pType = a.participation_type || a.participationType || 'meeting_only';
  const totalFee = (a.fee_amount || 0) + (a.after_party_fee_amount || 0);

  if (pType === 'absent') {
    return (
      <Card className="border-l-4 border-l-red-300 opacity-60">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-700">{a.user?.name || a.external_name}</p>
              <p className="text-sm text-gray-400">{a.club_name} · {MEMBER_TYPE_LABELS[a.member_type]}</p>
            </div>
            <Badge className="bg-red-100 text-red-700 text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              欠席連絡済み
            </Badge>
          </div>
          {a.note && <p className="text-xs text-gray-500 mt-2">💬 {a.note}</p>}
        </CardContent>
      </Card>
    );
  }

  if (pType === 'waitlist') {
    return (
      <Card className="border-l-4 border-l-yellow-400">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">{a.user?.name || a.external_name}</p>
              <p className="text-sm text-gray-500">{a.club_name} · {MEMBER_TYPE_LABELS[a.member_type]}</p>
            </div>
            <Badge className="bg-yellow-100 text-yellow-700 text-xs">
              <Hourglass className="h-3 w-3 mr-1" />
              キャンセル待ち
            </Badge>
          </div>
          {a.note && <p className="text-xs text-gray-500 mt-2">💬 {a.note}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-l-4 ${
      a.attendance_status === 'present' ? 'border-l-green-500' :
      a.attendance_status === 'absent' ? 'border-l-red-500' :
      'border-l-gray-300'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-lg font-bold text-gray-900">
              {a.user?.name || a.external_name}
            </p>
            <p className="text-sm text-gray-500">
              {a.club_name} · {MEMBER_TYPE_LABELS[a.member_type]}
            </p>
            {pType === 'meeting_and_party' && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-600 mt-0.5">
                <PartyPopper className="h-3 w-3" />
                懇親会参加
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="font-bold text-blue-600 text-lg">{formatCurrency(totalFee)}</p>
            {a.after_party_fee_amount > 0 && (
              <p className="text-xs text-purple-600">懇親会込み</p>
            )}
          </div>
        </div>

        {a.note && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 mb-3">
            💬 {a.note}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            size="lg"
            variant={a.attendance_status === 'present' ? 'default' : 'outline'}
            onClick={() => onAttendanceChange(a.id, 'present')}
            disabled={loading}
            className={`flex-1 ${a.attendance_status === 'present' ? 'bg-green-600 hover:bg-green-700' : ''}`}
          >
            <CheckCircle className="h-5 w-5" />
            出席
          </Button>

          <Button
            size="lg"
            variant={a.payment_status === 'paid' ? 'default' : 'outline'}
            onClick={() => onPaymentChange(a.id, a.payment_status === 'paid' ? 'unpaid' : 'paid')}
            disabled={loading}
            className={`flex-1 ${a.payment_status === 'paid' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-red-300 text-red-600 hover:bg-red-50'}`}
          >
            <DollarSign className="h-5 w-5" />
            {a.payment_status === 'paid' ? '支払済' : '未払い'}
          </Button>
        </div>

        {a.receipt_required && (
          <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            領収書希望（宛名: {a.receipt_name || '未設定'}）
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    gray: 'bg-gray-50 text-gray-600',
  };
  return (
    <div className={`rounded-lg p-3 ${colors[color] || colors.gray}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}
