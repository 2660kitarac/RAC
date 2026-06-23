'use client';

import { useState, useCallback } from 'react';

import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { UserRole, Attendance, PaymentStatus } from '@/types';
import { ATTENDANCE_STATUS_LABELS, PAYMENT_STATUS_COLORS, MEMBER_TYPE_LABELS } from '@/types';
import { CheckCircle2, XCircle, Clock, Users } from 'lucide-react';

interface ReceptionMeeting {
  id: string;
  title: string;
  date: string;
  status: string;
  fee_rac: number;
  fee_rc: number;
  fee_obog: number;
  fee_guest: number;
}

interface ReceptionPageProps {
  meetings: ReceptionMeeting[];
  clubId: string;
  userRole: UserRole;
}

export default function ReceptionPage({ meetings, clubId, userRole }: ReceptionPageProps) {
  const [selectedMeetingId, setSelectedMeetingId] = useState(meetings[0]?.id ?? '');
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const fetchAttendances = useCallback(async (meetingId: string) => {
    if (!meetingId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/attendances?meetingId=${meetingId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAttendances(data ?? []);
    } catch {
      toast.error('出席データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMeetingChange = (id: string) => {
    setSelectedMeetingId(id);
    fetchAttendances(id);
  };

  // コンポーネントマウント時に最初の例会を読み込む
  useState(() => {
    if (meetings[0]?.id) fetchAttendances(meetings[0].id);
  });

  // 出席・支払確認を一括更新（受付モード）
  const handleCheckin = async (attendance: Attendance) => {
    setLoadingIds(prev => new Set([...prev, attendance.id]));
    try {
      const updates: Partial<Attendance> = {
        attendance_status: 'present',
        payment_status: 'paid' as PaymentStatus,
        payment_method: 'cash',
        paid_at: new Date().toISOString(),
      };

      const res = await fetch(`/api/attendances/${attendance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceStatus: 'present', paymentStatus: 'paid',
          paymentMethod: 'cash', paidAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error();

      setAttendances(prev => prev.map(a =>
        a.id === attendance.id ? { ...a, ...updates } : a
      ));
      toast.success(`${attendance.external_name ?? attendance.user?.name ?? '参加者'} の受付完了`);
    } catch {
      toast.error('更新に失敗しました');
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(attendance.id); return s; });
    }
  };

  const handleAbsent = async (attendance: Attendance) => {
    setLoadingIds(prev => new Set([...prev, attendance.id]));
    try {
      const res = await fetch(`/api/attendances/${attendance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendanceStatus: 'absent' }),
      });
      if (!res.ok) throw new Error();
      setAttendances(prev => prev.map(a =>
        a.id === attendance.id ? { ...a, attendance_status: 'absent' } : a
      ));
      toast.success('欠席に設定しました');
    } catch {
      toast.error('更新に失敗しました');
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(attendance.id); return s; });
    }
  };

  // 集計
  const presentCount = attendances.filter(a => a.attendance_status === 'present').length;
  const undecidedCount = attendances.filter(a => a.attendance_status === 'undecided').length;
  const paidCount = attendances.filter(a => a.payment_status === 'paid').length;
  const totalFee = attendances
    .filter(a => a.payment_status === 'paid')
    .reduce((s, a) => s + a.fee_amount, 0);

  const selectedMeeting = meetings.find(m => m.id === selectedMeetingId);

  if (meetings.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-gray-400">
          <Users className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p>本日以降の開催予定例会がありません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 例会選択 */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Select value={selectedMeetingId} onValueChange={handleMeetingChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="例会を選択..." />
                </SelectTrigger>
                <SelectContent>
                  {meetings.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.title}（{formatDate(m.date)}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchAttendances(selectedMeetingId)}>
              更新
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 統計 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <p className="text-xs text-green-600 font-medium">受付済</p>
            </div>
            <p className="text-3xl font-bold text-green-700">{presentCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-1 mb-1">
              <Clock className="h-4 w-4 text-yellow-600" />
              <p className="text-xs text-yellow-600 font-medium">未確認</p>
            </div>
            <p className="text-3xl font-bold text-yellow-700">{undecidedCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 font-medium">支払済</p>
            <p className="text-3xl font-bold text-blue-700">{paidCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-indigo-50 border-indigo-200">
          <CardContent className="p-4">
            <p className="text-xs text-indigo-600 font-medium">徴収合計</p>
            <p className="text-xl font-bold text-indigo-700">{formatCurrency(totalFee)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 参加者リスト */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">参加登録者一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center text-gray-400">読み込み中...</div>
          ) : attendances.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p>登録者がいません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attendances.map(a => {
                const name = a.external_name ?? a.user?.name ?? '—';
                const isPresent = a.attendance_status === 'present';
                const isAbsent = a.attendance_status === 'absent';
                const isPaid = a.payment_status === 'paid';
                const isLoading = loadingIds.has(a.id);

                return (
                  <div key={a.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isPresent ? 'bg-green-50 border-green-200' :
                      isAbsent ? 'bg-gray-50 border-gray-200 opacity-60' :
                      'bg-white border-gray-200'
                    }`}
                  >
                    {/* 状態アイコン */}
                    <div className="flex-shrink-0">
                      {isPresent ? (
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                      ) : isAbsent ? (
                        <XCircle className="h-6 w-6 text-gray-400" />
                      ) : (
                        <Clock className="h-6 w-6 text-yellow-400" />
                      )}
                    </div>

                    {/* 名前・情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-sm ${isAbsent ? 'line-through text-gray-400' : ''}`}>
                          {name}
                        </span>
                        <span className="text-xs text-gray-400">
                          {MEMBER_TYPE_LABELS[a.member_type]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500">
                          参加費: {formatCurrency(a.fee_amount)}
                        </span>
                        {isPaid && (
                          <span className="text-xs text-green-600 font-medium">✓ 支払済</span>
                        )}
                        {a.receipt_required && (
                          <span className="text-xs text-blue-500">領収書希望</span>
                        )}
                      </div>
                    </div>

                    {/* 操作ボタン */}
                    {!isPresent && !isAbsent && (
                      <div className="flex gap-2 flex-shrink-0">
                        <Button size="sm"
                          onClick={() => handleCheckin(a)}
                          disabled={isLoading}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white h-8 px-3"
                        >
                          {isLoading ? '...' : '受付'}
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => handleAbsent(a)}
                          disabled={isLoading}
                          className="text-xs h-8 px-2"
                        >
                          欠席
                        </Button>
                      </div>
                    )}
                    {isPresent && (
                      <span className="text-xs font-medium text-green-600 flex-shrink-0">
                        受付済
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
