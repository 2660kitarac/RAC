'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import {
  Search, ArrowLeft, Download, Users, DollarSign,
  CheckCircle, XCircle, Clock, Smartphone, PartyPopper, Hourglass,
  Pencil, X, Trash2, ArrowUpDown, ArrowUp, ArrowDown,
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

// ソートキーの型
type SortKey = 'name' | 'club' | 'memberType' | 'participationType' | 'attendanceStatus' | 'paymentStatus' | 'fee' | '';
type SortDir = 'asc' | 'desc';

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
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ソート状態
  const [sortKey, setSortKey] = useState<SortKey>('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // 登録料インライン編集
  const [feeEditId, setFeeEditId] = useState<string | null>(null);
  const [feeEditValue, setFeeEditValue] = useState<string>('');
  const [feeEditLoading, setFeeEditLoading] = useState(false);

  // 参加形態インライン編集
  const [ptEditId, setPtEditId] = useState<string | null>(null);
  const [ptEditLoading, setPtEditLoading] = useState(false);

  const startFeeEdit = (a: any) => {
    setFeeEditId(a.id);
    setFeeEditValue(String(a.fee_amount ?? a.feeAmount ?? 0));
  };

  const saveFeeEdit = async (id: string) => {
    const parsed = parseInt(feeEditValue.replace(/[^0-9]/g, ''), 10);
    if (isNaN(parsed) || parsed < 0) {
      toast.error('正しい金額を入力してください');
      return;
    }
    setFeeEditLoading(true);
    const res = await fetch(`/api/attendances/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feeAmount: parsed }),
    });
    if (!res.ok) {
      toast.error('登録料の更新に失敗しました');
    } else {
      setAttendances(prev => prev.map(a =>
        (a as any).id === id
          ? { ...a, fee_amount: parsed, feeAmount: parsed }
          : a
      ));
      toast.success('登録料を更新しました');
    }
    setFeeEditId(null);
    setFeeEditLoading(false);
  };

  const cancelFeeEdit = () => setFeeEditId(null);

  // 参加形態更新
  const saveParticipationType = async (id: string, value: string) => {
    setPtEditLoading(true);
    const res = await fetch(`/api/attendances/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participationType: value }),
    });
    if (!res.ok) {
      toast.error('参加形態の更新に失敗しました');
    } else {
      setAttendances(prev => prev.map(a =>
        (a as any).id === id
          ? { ...a, participation_type: value, participationType: value }
          : a
      ));
      toast.success('参加形態を更新しました');
    }
    setPtEditId(null);
    setPtEditLoading(false);
  };

  const deleteAttendance = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/attendances/${deleteTarget.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('削除に失敗しました');
    } else {
      setAttendances(prev => prev.filter(a => (a as any).id !== deleteTarget.id));
      toast.success('参加者を削除しました');
      setDeleteTarget(null);
    }
    setDeleteLoading(false);
  };

  // 参加者基本情報編集モーダル用
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    externalName: '',
    externalEmail: '',
    externalPhone: '',
    clubName: '',
    memberType: '',
    note: '',
  });
  const [editSaving, setEditSaving] = useState(false);

  const openEditModal = (a: any) => {
    setEditTarget(a);
    setEditForm({
      externalName: a.externalName || a.external_name || '',
      externalEmail: a.externalEmail || a.external_email || '',
      externalPhone: a.externalPhone || a.external_phone || '',
      clubName: a.clubName || a.club_name || '',
      memberType: a.memberType || a.member_type || 'RAC',
      note: a.note || '',
    });
  };

  const closeEditModal = () => {
    setEditTarget(null);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    const payload: Record<string, string> = {};
    const hasUserId = editTarget.userId || editTarget.user_id;
    const currentName = editTarget.externalName || editTarget.external_name || '';
    const isClubName = currentName.includes('ローターアクトクラブ') || currentName.includes('ロータアクト');
    if (!hasUserId || isClubName) {
      payload.externalName = editForm.externalName;
      payload.externalEmail = editForm.externalEmail;
      payload.externalPhone = editForm.externalPhone;
    }
    payload.clubName = editForm.clubName;
    payload.memberType = editForm.memberType;
    payload.note = editForm.note;

    const res = await fetch(`/api/attendances/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast.error('更新に失敗しました');
    } else {
      setAttendances(prev => prev.map(a =>
        (a as any).id === editTarget.id
          ? {
              ...a,
              externalName: editForm.externalName,
              external_name: editForm.externalName,
              externalEmail: editForm.externalEmail,
              external_email: editForm.externalEmail,
              externalPhone: editForm.externalPhone,
              external_phone: editForm.externalPhone,
              clubName: editForm.clubName,
              club_name: editForm.clubName,
              memberType: editForm.memberType,
              member_type: editForm.memberType,
              note: editForm.note,
            }
          : a
      ));
      toast.success('参加者情報を更新しました');
      closeEditModal();
    }
    setEditSaving(false);
  };

  // ソートトグル
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // ソートアイコン表示
  const SortIcon = ({ sk }: { sk: SortKey }) => {
    if (sortKey !== sk) return <ArrowUpDown className="h-3 w-3 ml-1 text-gray-300 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 text-blue-500 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 text-blue-500 inline" />;
  };

  // ソート可能なヘッダーセル
  const SortableHeader = ({ sk, children }: { sk: SortKey; children: React.ReactNode }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100 transition-colors"
      onClick={() => toggleSort(sk)}
    >
      <span className="flex items-center gap-1">
        {children}
        <SortIcon sk={sk} />
      </span>
    </th>
  );

  // getName ヘルパー（camelCase/snake_case 両対応）
  const getName = (a: any) =>
    a.userName ?? a.user?.name ?? a.externalName ?? a.external_name ?? '';

  const filtered = useMemo(() => {
    let result = attendances.filter(a => {
      const name = getName(a as any);
      const club = (a as any).clubName || (a as any).club_name || '';
      const matchSearch = !searchQuery ||
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        club.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'all' || (a as any).attendance_status === statusFilter || (a as any).attendanceStatus === statusFilter;
      const matchPayment = paymentFilter === 'all' || (a as any).payment_status === paymentFilter || (a as any).paymentStatus === paymentFilter;
      const matchType = memberTypeFilter === 'all' || (a as any).member_type === memberTypeFilter || (a as any).memberType === memberTypeFilter;
      const pType = (a as any).participation_type || (a as any).participationType || 'meeting_only';
      const matchParticipation = participationFilter === 'all' || pType === participationFilter;
      return matchSearch && matchStatus && matchPayment && matchType && matchParticipation;
    });

    // ソート
    if (sortKey) {
      result = [...result].sort((a: any, b: any) => {
        let va = '', vb = '';
        switch (sortKey) {
          case 'name':
            va = getName(a);
            vb = getName(b);
            break;
          case 'club':
            va = a.clubName || a.club_name || '';
            vb = b.clubName || b.club_name || '';
            break;
          case 'memberType':
            va = MEMBER_TYPE_LABELS[a.memberType || a.member_type] || '';
            vb = MEMBER_TYPE_LABELS[b.memberType || b.member_type] || '';
            break;
          case 'participationType': {
            const ORDER = { meeting_and_party: 0, meeting_only: 1, waitlist: 2, absent: 3 };
            const ptA = a.participation_type || a.participationType || 'meeting_only';
            const ptB = b.participation_type || b.participationType || 'meeting_only';
            const diff = ((ORDER as any)[ptA] ?? 9) - ((ORDER as any)[ptB] ?? 9);
            return sortDir === 'asc' ? diff : -diff;
          }
          case 'attendanceStatus': {
            const ORDER2 = { present: 0, undecided: 1, absent: 2 };
            const stA = a.attendance_status || a.attendanceStatus || 'undecided';
            const stB = b.attendance_status || b.attendanceStatus || 'undecided';
            const diff2 = ((ORDER2 as any)[stA] ?? 9) - ((ORDER2 as any)[stB] ?? 9);
            return sortDir === 'asc' ? diff2 : -diff2;
          }
          case 'paymentStatus': {
            const ORDER3 = { unpaid: 0, paid: 1, exempt: 2 };
            const psA = a.payment_status || a.paymentStatus || 'unpaid';
            const psB = b.payment_status || b.paymentStatus || 'unpaid';
            const diff3 = ((ORDER3 as any)[psA] ?? 9) - ((ORDER3 as any)[psB] ?? 9);
            return sortDir === 'asc' ? diff3 : -diff3;
          }
          case 'fee': {
            const fA = (a.fee_amount ?? a.feeAmount ?? 0);
            const fB = (b.fee_amount ?? b.feeAmount ?? 0);
            return sortDir === 'asc' ? fA - fB : fB - fA;
          }
        }
        const cmp = va.localeCompare(vb, 'ja');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [attendances, searchQuery, statusFilter, paymentFilter, memberTypeFilter, participationFilter, sortKey, sortDir]);

  const stats = useMemo(() => {
    const active = attendances.filter(a => {
      const pt = (a as any).participation_type || (a as any).participationType || 'meeting_only';
      return pt !== 'absent' && pt !== 'waitlist';
    });
    return {
      total: active.length,
      present: attendances.filter(a => (a as any).attendance_status === 'present' || (a as any).attendanceStatus === 'present').length,
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
      unpaid: attendances.filter(a => {
        const ps = (a as any).payment_status || (a as any).paymentStatus;
        const pt = (a as any).participation_type || (a as any).participationType;
        return ps === 'unpaid' && pt !== 'absent';
      }).length,
      paidAmount: attendances.filter(a => {
        const ps = (a as any).payment_status || (a as any).paymentStatus;
        return ps === 'paid';
      }).reduce((sum, a) => sum + ((a as any).fee_amount || (a as any).feeAmount || 0) + ((a as any).after_party_fee_amount || 0), 0),
      totalAmount: active.reduce((sum, a) => sum + ((a as any).fee_amount || (a as any).feeAmount || 0) + ((a as any).after_party_fee_amount || 0), 0),
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
      setAttendances(prev => prev.map(a => (a as any).id === id ? { ...a, attendance_status: status, attendanceStatus: status } : a));
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
        ...a, payment_status: status, paymentStatus: status,
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
      '氏名': getName(a as any),
      '所属クラブ': (a as any).clubName || (a as any).club_name || '',
      '区分': MEMBER_TYPE_LABELS[(a as any).memberType || (a as any).member_type] || '',
      '参加形態': PARTICIPATION_LABELS[(a as any).participation_type || (a as any).participationType || 'meeting_only'] || '',
      '出席状況': ATTENDANCE_STATUS_LABELS[(a as any).attendanceStatus || (a as any).attendance_status] || '',
      '支払状況': PAYMENT_STATUS_LABELS[(a as any).paymentStatus || (a as any).payment_status] || '',
      '例会費': (a as any).fee_amount || (a as any).feeAmount || 0,
      '懇親会費': (a as any).after_party_fee_amount || 0,
      '領収書': (a as any).receipt_required || (a as any).receiptRequired ? '希望' : '不要',
      'メモ': (a as any).note || '',
      '登録日時': (a as any).registered_at || (a as any).registeredAt,
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
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">
                        {/* チェックボックス列 */}
                      </th>
                      <SortableHeader sk="name">氏名</SortableHeader>
                      <SortableHeader sk="club">所属</SortableHeader>
                      <SortableHeader sk="memberType">区分</SortableHeader>
                      <SortableHeader sk="participationType">参加形態</SortableHeader>
                      <SortableHeader sk="attendanceStatus">出席</SortableHeader>
                      <SortableHeader sk="paymentStatus">支払</SortableHeader>
                      <SortableHeader sk="fee">登録料</SortableHeader>
                      <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">メモ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(attendance => {
                      const a = attendance as any;
                      const pType = a.participation_type || a.participationType || 'meeting_only';
                      const displayName = getName(a);
                      const feeAmt = a.fee_amount ?? a.feeAmount ?? 0;
                      return (
                        <tr key={a.id} className={`hover:bg-gray-50 transition-colors ${pType === 'absent' ? 'opacity-50' : ''}`}>
                          {/* 操作列（編集・削除） */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditModal(a)}
                                title="参加者情報を編集"
                                className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget(a)}
                                title="参加者を削除"
                                className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                          {/* 氏名 */}
                          <td className="px-4 py-3">
                            <p className="font-medium">{displayName}</p>
                            {(a.receiptRequired || a.receipt_required) && (
                              <span className="text-xs text-blue-600">領収書希望</span>
                            )}
                          </td>
                          {/* 所属 */}
                          <td className="px-4 py-3">
                            <p className="text-xs text-gray-500">
                              {a.clubName || a.club_name || '—'}
                            </p>
                          </td>
                          {/* 区分 */}
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className="text-xs">
                              {MEMBER_TYPE_LABELS[a.memberType || a.member_type] || a.memberType || a.member_type}
                            </Badge>
                          </td>
                          {/* 参加形態 — インライン Select */}
                          <td className="px-4 py-3">
                            {ptEditId === a.id ? (
                              <Select
                                value={pType}
                                onValueChange={v => saveParticipationType(a.id, v)}
                                disabled={ptEditLoading}
                              >
                                <SelectTrigger className="h-8 text-xs w-36 border-blue-400">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(PARTICIPATION_LABELS).map(([v, l]) => (
                                    <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPtEditId(a.id)}
                                title="クリックして変更"
                                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-opacity hover:opacity-70 ${PARTICIPATION_COLORS[pType] || 'bg-gray-100 text-gray-600'}`}
                              >
                                {pType === 'meeting_and_party' && <PartyPopper className="h-3 w-3" />}
                                {pType === 'absent' && <XCircle className="h-3 w-3" />}
                                {pType === 'waitlist' && <Hourglass className="h-3 w-3" />}
                                {PARTICIPATION_LABELS[pType] || pType}
                              </button>
                            )}
                          </td>
                          {/* 出席確認 */}
                          <td className="px-4 py-3">
                            {pType === 'absent' ? (
                              <span className="text-xs text-gray-400">-</span>
                            ) : (
                              <Select
                                value={a.attendanceStatus || a.attendance_status || 'undecided'}
                                onValueChange={v => updateAttendanceStatus(a.id, v as AttendanceStatus)}
                              >
                                <SelectTrigger className={`h-8 text-xs w-28 ${ATTENDANCE_STATUS_COLORS[a.attendanceStatus || a.attendance_status] || ''}`}>
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
                          {/* 支払 */}
                          <td className="px-4 py-3">
                            {pType === 'absent' ? (
                              <span className="text-xs text-gray-400">-</span>
                            ) : (
                              <Select
                                value={a.paymentStatus || a.payment_status || 'unpaid'}
                                onValueChange={v => updatePaymentStatus(a.id, v as PaymentStatus)}
                              >
                                <SelectTrigger className={`h-8 text-xs w-28 ${PAYMENT_STATUS_COLORS[a.paymentStatus || a.payment_status] || ''}`}>
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
                          {/* 登録料 */}
                          <td className="px-4 py-3">
                            {pType === 'absent' ? (
                              <span className="text-xs text-gray-400">-</span>
                            ) : feeEditId === a.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">¥</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="100"
                                  value={feeEditValue}
                                  onChange={e => setFeeEditValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveFeeEdit(a.id);
                                    if (e.key === 'Escape') cancelFeeEdit();
                                  }}
                                  onBlur={() => saveFeeEdit(a.id)}
                                  className="w-20 h-7 px-1.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  autoFocus
                                  disabled={feeEditLoading}
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startFeeEdit(a)}
                                title="クリックして登録料を変更"
                                className="group text-left"
                              >
                                <span className="font-medium group-hover:text-blue-600 transition-colors">
                                  {formatCurrency(feeAmt)}
                                </span>
                                {(a.after_party_fee_amount ?? 0) > 0 && (
                                  <div className="text-xs text-purple-600">
                                    +懇親会 {formatCurrency(a.after_party_fee_amount)}
                                  </div>
                                )}
                                <div className="text-xs text-gray-300 group-hover:text-blue-400 transition-colors">✎ 変更</div>
                              </button>
                            )}
                          </td>
                          {/* メモ */}
                          <td className="hidden md:table-cell px-4 py-3 text-xs text-gray-500 max-w-32">
                            {a.note && <span title={a.note}>{a.note.length > 20 ? a.note.substring(0, 20) + '…' : a.note}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={7} className="px-4 py-2 text-sm font-medium text-gray-700">
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
                          return sum + ((a as any).fee_amount ?? (a as any).feeAmount ?? 0) + ((a as any).after_party_fee_amount || 0);
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

      {/* 削除確認ダイアログ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-500" />
                参加者を削除
              </h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">
                <span className="font-medium">
                  {getName(deleteTarget)}
                </span>
                を参加者リストから削除しますか？
              </p>
              <p className="text-xs text-red-600 mt-2">この操作は取り消せません。</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
                キャンセル
              </Button>
              <Button
                onClick={deleteAttendance}
                disabled={deleteLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteLoading ? '削除中...' : '削除する'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 参加者基本情報編集モーダル */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-blue-600" />
                <h2 className="font-bold text-gray-900 text-base">参加者情報の編集</h2>
              </div>
              <button
                onClick={closeEditModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* お名前 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  お名前
                  {(editTarget.userId || editTarget.user_id) &&
                   !(editTarget.externalName || editTarget.external_name || '').includes('ロータ') && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">（会員登録済みのため変更不可）</span>
                  )}
                </label>
                {((editTarget.userId || editTarget.user_id) &&
                  !(editTarget.externalName || editTarget.external_name || '').includes('ロータ')) ? (
                  <div className="px-3 py-2 bg-gray-50 rounded-md text-sm text-gray-600 border border-gray-200">
                    {editTarget.userName || editTarget.user?.name || editTarget.externalName || editTarget.external_name || '（未設定）'}
                  </div>
                ) : (
                  <Input
                    value={editForm.externalName}
                    onChange={e => setEditForm(f => ({ ...f, externalName: e.target.value }))}
                    placeholder="例: 山田 太郎"
                  />
                )}
              </div>

              {/* メール・電話：外部参加者のみ */}
              {(!(editTarget.userId || editTarget.user_id) ||
                (editTarget.externalName || editTarget.external_name || '').includes('ロータ')) && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                    <Input
                      type="email"
                      value={editForm.externalEmail}
                      onChange={e => setEditForm(f => ({ ...f, externalEmail: e.target.value }))}
                      placeholder="例: taro@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
                    <Input
                      type="tel"
                      value={editForm.externalPhone}
                      onChange={e => setEditForm(f => ({ ...f, externalPhone: e.target.value }))}
                      placeholder="例: 090-1234-5678"
                    />
                  </div>
                </>
              )}

              {/* 所属クラブ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所属クラブ</label>
                <Input
                  value={editForm.clubName}
                  onChange={e => setEditForm(f => ({ ...f, clubName: e.target.value }))}
                  placeholder="例: ○○ローターアクトクラブ"
                />
              </div>

              {/* 区分 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">区分</label>
                <Select
                  value={editForm.memberType}
                  onValueChange={v => setEditForm(f => ({ ...f, memberType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="区分を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RAC">RAC</SelectItem>
                    <SelectItem value="RC">RC</SelectItem>
                    <SelectItem value="OB_OG">OB・OG</SelectItem>
                    <SelectItem value="GUEST">ゲスト</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* メモ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
                <textarea
                  value={editForm.note}
                  onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="備考など"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <Button variant="outline" size="sm" onClick={closeEditModal} disabled={editSaving}>
                キャンセル
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? '保存中…' : '保存する'}
              </Button>
            </div>
          </div>
        </div>
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
  const totalFee = (a.fee_amount ?? a.feeAmount ?? 0) + (a.after_party_fee_amount || 0);
  const displayName = a.userName ?? a.user?.name ?? a.externalName ?? a.external_name ?? '—';

  if (pType === 'absent') {
    return (
      <Card className="border-l-4 border-l-red-300 opacity-60">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-700">{displayName}</p>
              <p className="text-sm text-gray-400">{a.clubName || a.club_name} · {MEMBER_TYPE_LABELS[a.memberType || a.member_type]}</p>
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
              <p className="font-bold text-gray-900">{displayName}</p>
              <p className="text-sm text-gray-500">{a.clubName || a.club_name} · {MEMBER_TYPE_LABELS[a.memberType || a.member_type]}</p>
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
      a.attendance_status === 'present' || a.attendanceStatus === 'present' ? 'border-l-green-500' :
      a.attendance_status === 'absent' || a.attendanceStatus === 'absent' ? 'border-l-red-500' :
      'border-l-gray-300'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-lg font-bold text-gray-900">{displayName}</p>
            <p className="text-sm text-gray-500">
              {a.clubName || a.club_name} · {MEMBER_TYPE_LABELS[a.memberType || a.member_type]}
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
            {(a.after_party_fee_amount ?? 0) > 0 && (
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
            variant={(a.attendance_status === 'present' || a.attendanceStatus === 'present') ? 'default' : 'outline'}
            onClick={() => onAttendanceChange(a.id, 'present')}
            disabled={loading}
            className={`flex-1 ${(a.attendance_status === 'present' || a.attendanceStatus === 'present') ? 'bg-green-600 hover:bg-green-700' : ''}`}
          >
            <CheckCircle className="h-5 w-5" />
            出席
          </Button>

          <Button
            size="lg"
            variant={(a.payment_status === 'paid' || a.paymentStatus === 'paid') ? 'default' : 'outline'}
            onClick={() => onPaymentChange(a.id, (a.payment_status === 'paid' || a.paymentStatus === 'paid') ? 'unpaid' : 'paid')}
            disabled={loading}
            className={`flex-1 ${(a.payment_status === 'paid' || a.paymentStatus === 'paid') ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-red-300 text-red-600 hover:bg-red-50'}`}
          >
            <DollarSign className="h-5 w-5" />
            {(a.payment_status === 'paid' || a.paymentStatus === 'paid') ? '支払済' : '未払い'}
          </Button>
        </div>

        {(a.receipt_required || a.receiptRequired) && (
          <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            領収書希望（宛名: {a.receipt_name || a.receiptName || '未設定'}）
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
