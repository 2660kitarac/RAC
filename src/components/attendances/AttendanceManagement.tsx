'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import {
  Search, Filter, ArrowLeft, Download, Users, DollarSign,
  CheckCircle, XCircle, Clock, RefreshCw, Smartphone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, formatCurrency, exportToCSV } from '@/lib/utils';
import type { Meeting, Attendance, UserRole, AttendanceStatus, PaymentStatus } from '@/types';
import { 
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_COLORS, 
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  MEMBER_TYPE_LABELS
} from '@/types';

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
  const [loading, setLoading] = useState<string | null>(null);
  const [receptionMode, setReceptionMode] = useState(false);
  const filtered = useMemo(() => {
    return attendances.filter(a => {
      const name = a.user?.name || a.external_name || '';
      const club = a.club_name || '';
      const matchSearch = !searchQuery ||
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        club.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'all' || a.attendance_status === statusFilter;
      const matchPayment = paymentFilter === 'all' || a.payment_status === paymentFilter;
      const matchType = memberTypeFilter === 'all' || a.member_type === memberTypeFilter;
      return matchSearch && matchStatus && matchPayment && matchType;
    });
  }, [attendances, searchQuery, statusFilter, paymentFilter, memberTypeFilter]);

  const stats = useMemo(() => ({
    total: attendances.length,
    present: attendances.filter(a => a.attendance_status === 'present').length,
    absent: attendances.filter(a => a.attendance_status === 'absent').length,
    undecided: attendances.filter(a => a.attendance_status === 'undecided').length,
    unpaid: attendances.filter(a => a.payment_status === 'unpaid').length,
    paid: attendances.filter(a => a.payment_status === 'paid').length,
    totalAmount: attendances.reduce((sum, a) => sum + a.fee_amount, 0),
    paidAmount: attendances.filter(a => a.payment_status === 'paid').reduce((sum, a) => sum + a.fee_amount, 0),
  }), [attendances]);

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
      setAttendances(prev => prev.map(a => a.id === id ? { ...a, attendance_status: status } : a));
      toast.success('出席状況を更新しました');
    }
    setLoading(null);
  };

  const updatePaymentStatus = async (id: string, status: PaymentStatus) => {
    setLoading(id);
    const attendance = attendances.find(a => a.id === id);
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
      setAttendances(prev => prev.map(a => a.id === id ? {
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
      '氏名': a.user?.name || a.external_name || '',
      'ふりがな': '',
      '所属クラブ': a.club_name || '',
      '区分': MEMBER_TYPE_LABELS[a.member_type],
      '出席状況': ATTENDANCE_STATUS_LABELS[a.attendance_status],
      '支払状況': PAYMENT_STATUS_LABELS[a.payment_status],
      '登録料': a.fee_amount,
      'お弁当': a.meal_required ? '希望' : '不要',
      '領収書': a.receipt_required ? '希望' : '不要',
      '備考': a.note || '',
      '登録日時': a.registered_at,
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
        <StatChip label="登録総数" value={`${stats.total}名`} color="blue" />
        <StatChip label="出席予定" value={`${stats.present}名`} color="green" />
        <StatChip
          label="未払い"
          value={`${stats.unpaid}名`}
          color={stats.unpaid > 0 ? 'red' : 'green'}
        />
        <StatChip label="入金済額" value={formatCurrency(stats.paidAmount)} color="blue" />
      </div>

      {/* フィルター */}
      <Card>
        <CardContent className="p-3">
          <div className={`grid gap-2 ${receptionMode ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-4'}`}>
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
          {(searchQuery || statusFilter !== 'all' || paymentFilter !== 'all') && (
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
          {/* 受付モード（モバイル向け大きなカード） */}
          {receptionMode ? (
            <div className="space-y-3">
              {filtered.map(attendance => (
                <ReceptionCard
                  key={attendance.id}
                  attendance={attendance}
                  loading={loading === attendance.id}
                  onAttendanceChange={updateAttendanceStatus}
                  onPaymentChange={updatePaymentStatus}
                />
              ))}
            </div>
          ) : (
            /* 通常テーブル表示 */
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">氏名</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">所属</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">区分</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">出席</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">支払</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">登録料</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">弁当</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(attendance => (
                      <tr key={attendance.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium">{attendance.user?.name || attendance.external_name}</p>
                          {attendance.receipt_required && (
                            <span className="text-xs text-blue-600">領収書希望</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {attendance.club_name || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="text-xs">
                            {MEMBER_TYPE_LABELS[attendance.member_type]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            value={attendance.attendance_status}
                            onValueChange={v => updateAttendanceStatus(attendance.id, v as AttendanceStatus)}
                          >
                            <SelectTrigger className={`h-8 text-xs w-28 ${ATTENDANCE_STATUS_COLORS[attendance.attendance_status]}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(ATTENDANCE_STATUS_LABELS).map(([v, l]) => (
                                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            value={attendance.payment_status}
                            onValueChange={v => updatePaymentStatus(attendance.id, v as PaymentStatus)}
                          >
                            <SelectTrigger className={`h-8 text-xs w-28 ${PAYMENT_STATUS_COLORS[attendance.payment_status]}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unpaid" className="text-xs">未払い</SelectItem>
                              <SelectItem value="paid" className="text-xs">支払済</SelectItem>
                              <SelectItem value="exempt" className="text-xs">免除</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {formatCurrency(attendance.fee_amount)}
                        </td>
                        <td className="px-4 py-3">
                          {attendance.meal_required ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-gray-300" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-sm font-medium text-gray-700">
                        合計 {filtered.length}名
                      </td>
                      <td className="px-4 py-2 font-bold text-gray-900">
                        {formatCurrency(filtered.reduce((sum, a) => sum + a.fee_amount, 0))}
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
  attendance, loading, onAttendanceChange, onPaymentChange
}: {
  attendance: Attendance;
  loading: boolean;
  onAttendanceChange: (id: string, status: AttendanceStatus) => void;
  onPaymentChange: (id: string, status: PaymentStatus) => void;
}) {
  return (
    <Card className={`border-l-4 ${
      attendance.attendance_status === 'present' ? 'border-l-green-500' :
      attendance.attendance_status === 'absent' ? 'border-l-red-500' :
      'border-l-gray-300'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-lg font-bold text-gray-900">
              {attendance.user?.name || attendance.external_name}
            </p>
            <p className="text-sm text-gray-500">
              {attendance.club_name} · {MEMBER_TYPE_LABELS[attendance.member_type]}
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold text-blue-600 text-lg">{formatCurrency(attendance.fee_amount)}</p>
            <p className={`text-xs font-medium ${attendance.meal_required ? 'text-orange-600' : 'text-gray-400'}`}>
              {attendance.meal_required ? '弁当あり' : '弁当なし'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {/* 出席ボタン */}
          <Button
            size="lg"
            variant={attendance.attendance_status === 'present' ? 'default' : 'outline'}
            onClick={() => onAttendanceChange(attendance.id, 'present')}
            disabled={loading}
            className={`flex-1 ${attendance.attendance_status === 'present' ? 'bg-green-600 hover:bg-green-700' : ''}`}
          >
            <CheckCircle className="h-5 w-5" />
            出席
          </Button>
          
          {/* 支払済みボタン */}
          <Button
            size="lg"
            variant={attendance.payment_status === 'paid' ? 'success' : 'outline'}
            onClick={() => onPaymentChange(attendance.id, attendance.payment_status === 'paid' ? 'unpaid' : 'paid')}
            disabled={loading}
            className={`flex-1 ${attendance.payment_status === 'paid' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-red-300 text-red-600 hover:bg-red-50'}`}
          >
            <DollarSign className="h-5 w-5" />
            {attendance.payment_status === 'paid' ? '支払済' : '未払い'}
          </Button>
        </div>

        {attendance.receipt_required && (
          <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            領収書希望（宛名: {attendance.receipt_name || '未設定'}）
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
  };
  return (
    <div className={`rounded-lg p-3 ${colors[color]}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}
