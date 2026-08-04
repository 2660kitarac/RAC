'use client';

import { useState, useCallback } from 'react';

import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { UserRole, PaymentStatus } from '@/types';
import { MEMBER_TYPE_LABELS } from '@/types';
import {
  CheckCircle2, XCircle, Clock, Users, Building2, Globe,
  UserPlus, X, Phone,
} from 'lucide-react';

interface ReceptionMeeting {
  id: string;
  title: string;
  date: string;
  status: string;
  // camelCase (SELECTの結果)
  feeRac?: number;
  feeRc?: number;
  feeObog?: number;
  feeGuest?: number;
  mealFee?: number;
  hasAfterParty?: boolean;
  afterPartyFeeRac?: number;
  afterPartyFeeRc?: number;
  afterPartyFeeObog?: number;
  afterPartyFeeGuest?: number;
  ownClubFee?: number | null;
  // snake_case (後方互換)
  fee_rac?: number;
  fee_rc?: number;
  fee_obog?: number;
  fee_guest?: number;
}

interface AttendanceItem {
  id: string;
  userId?: string | null;
  user_id?: string | null;
  // camelCase (API返却)
  userName?: string | null;
  externalName?: string | null;
  clubName?: string | null;
  memberType?: string;
  attendanceStatus?: string;
  attendance_status?: string;
  paymentStatus?: string;
  payment_status?: string;
  feeAmount?: number;
  fee_amount?: number;
  receiptRequired?: boolean;
  receipt_required?: boolean;
  participationType?: string;
  participation_type?: string;
  [key: string]: unknown;
}

interface ReceptionPageProps {
  meetings: ReceptionMeeting[];
  clubId: string;
  userRole: UserRole;
}

// ---- データアクセスヘルパー ----
function getName(a: AttendanceItem): string {
  return a.userName ?? a.externalName ?? '—';
}
function getAttendanceStatus(a: AttendanceItem): string {
  return (a.attendanceStatus ?? a.attendance_status ?? 'undecided') as string;
}
function getPaymentStatus(a: AttendanceItem): string {
  return (a.paymentStatus ?? a.payment_status ?? 'unpaid') as string;
}
function getFeeAmount(a: AttendanceItem): number {
  return (a.feeAmount ?? a.fee_amount ?? 0) as number;
}
function getMemberType(a: AttendanceItem): string {
  return (a.memberType ?? (a as any).member_type ?? 'RAC') as string;
}
function getClubName(a: AttendanceItem): string {
  return (a.clubName ?? (a as any).club_name ?? '') as string;
}
function getUserId(a: AttendanceItem): string | null {
  return (a.userId ?? a.user_id ?? null) as string | null;
}
function getParticipationType(a: AttendanceItem): string {
  return (a.participationType ?? a.participation_type ?? 'meeting_only') as string;
}

// 登録料自動計算（meeting の fee フィールドから算出）
function calcFee(
  meeting: ReceptionMeeting,
  memberType: string,
  participationType: string,
  isOwnClub: boolean,
): number {
  const feeRac = meeting.feeRac ?? meeting.fee_rac ?? 0;
  const feeRc = meeting.feeRc ?? meeting.fee_rc ?? 0;
  const feeObog = meeting.feeObog ?? meeting.fee_obog ?? 0;
  const feeGuest = meeting.feeGuest ?? meeting.fee_guest ?? 0;
  const ownClubFee = meeting.ownClubFee;

  // 自クラブ会員は ownClubFee 優先（null/undefined なら 0）
  let base = 0;
  if (isOwnClub && ownClubFee !== undefined) {
    base = ownClubFee ?? 0;
  } else {
    switch (memberType) {
      case 'RAC': base = feeRac; break;
      case 'RC': base = feeRc; break;
      case 'OB_OG': base = feeObog; break;
      case 'GUEST': base = feeGuest; break;
      default: base = feeGuest;
    }
  }

  let afterParty = 0;
  if (participationType === 'meeting_and_party' && meeting.hasAfterParty) {
    switch (memberType) {
      case 'RAC': afterParty = meeting.afterPartyFeeRac ?? 0; break;
      case 'RC': afterParty = meeting.afterPartyFeeRc ?? 0; break;
      case 'OB_OG': afterParty = meeting.afterPartyFeeObog ?? 0; break;
      case 'GUEST': afterParty = meeting.afterPartyFeeGuest ?? 0; break;
    }
  }

  return base + afterParty;
}

// ---- 手動登録フォームの初期値 ----
const INITIAL_FORM = {
  name: '',
  phone: '',
  email: '',
  clubName: '',
  memberType: 'RAC',
  participationType: 'meeting_only',
  feeAmount: 0,
  feeOverride: false,   // 手動で金額を上書きしたか
  checkinNow: true,     // 登録と同時に受付済みにするか
  note: '',
};

export default function ReceptionPage({ meetings, clubId, userRole }: ReceptionPageProps) {
  const [selectedMeetingId, setSelectedMeetingId] = useState(meetings[0]?.id ?? '');
  const [attendances, setAttendances] = useState<AttendanceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  // 手動登録モーダル
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState(INITIAL_FORM);
  const [manualSaving, setManualSaving] = useState(false);

  const selectedMeeting = meetings.find(m => m.id === selectedMeetingId);

  // フォーム値が変わるたびに登録料を自動計算（override フラグが立っていない場合）
  const updateFormField = (
    field: keyof typeof INITIAL_FORM,
    value: string | number | boolean,
  ) => {
    setManualForm(prev => {
      const next = { ...prev, [field]: value };
      // memberType / participationType が変わったとき、かつ金額を手動上書きしていなければ再計算
      if (!next.feeOverride && selectedMeeting) {
        const isOwnClub = false; // 手動登録は外部参加者扱い（userId なし）
        next.feeAmount = calcFee(
          selectedMeeting,
          next.memberType,
          next.participationType,
          isOwnClub,
        );
      }
      return next;
    });
  };

  const openManualForm = () => {
    if (!selectedMeeting) return;
    const fee = calcFee(selectedMeeting, 'RAC', 'meeting_only', false);
    setManualForm({ ...INITIAL_FORM, feeAmount: fee });
    setShowManualForm(true);
  };

  const closeManualForm = () => {
    setShowManualForm(false);
    setManualForm(INITIAL_FORM);
  };

  const handleManualSubmit = async () => {
    if (!manualForm.name.trim()) {
      toast.error('氏名を入力してください');
      return;
    }
    if (!selectedMeetingId) return;

    setManualSaving(true);
    try {
      const body: Record<string, unknown> = {
        meetingId: selectedMeetingId,
        externalName: manualForm.name.trim(),
        externalPhone: manualForm.phone.trim() || null,
        externalEmail: manualForm.email.trim() || null,
        clubName: manualForm.clubName.trim() || null,
        memberType: manualForm.memberType,
        participationType: manualForm.participationType,
        feeAmount: manualForm.feeAmount,
        attendanceStatus: manualForm.checkinNow ? 'present' : 'undecided',
        paymentStatus: manualForm.checkinNow ? 'paid' : 'unpaid',
        paymentMethod: manualForm.checkinNow ? 'cash' : null,
        paidAt: manualForm.checkinNow ? new Date().toISOString() : null,
        registrationType: 'manual',
        note: manualForm.note.trim() || null,
      };

      const res = await fetch('/api/attendances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error();
      const created = await res.json();

      // リストに追加
      const newItem: AttendanceItem = {
        id: created.id,
        userId: null,
        externalName: manualForm.name.trim(),
        clubName: manualForm.clubName.trim() || null,
        memberType: manualForm.memberType,
        participationType: manualForm.participationType,
        participation_type: manualForm.participationType,
        feeAmount: manualForm.feeAmount,
        fee_amount: manualForm.feeAmount,
        attendanceStatus: manualForm.checkinNow ? 'present' : 'undecided',
        attendance_status: manualForm.checkinNow ? 'present' : 'undecided',
        paymentStatus: manualForm.checkinNow ? 'paid' : 'unpaid',
        payment_status: manualForm.checkinNow ? 'paid' : 'unpaid',
        note: manualForm.note.trim() || null,
      };

      setAttendances(prev => [...prev, newItem]);
      toast.success(
        manualForm.checkinNow
          ? `${manualForm.name} を登録・受付しました`
          : `${manualForm.name} を登録しました`
      );
      closeManualForm();
    } catch {
      toast.error('登録に失敗しました');
    } finally {
      setManualSaving(false);
    }
  };

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

  useState(() => {
    if (meetings[0]?.id) fetchAttendances(meetings[0].id);
  });

  const handleCheckin = async (a: AttendanceItem) => {
    setLoadingIds(prev => new Set([...prev, a.id]));
    try {
      const res = await fetch(`/api/attendances/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceStatus: 'present', paymentStatus: 'paid',
          paymentMethod: 'cash', paidAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error();
      setAttendances(prev => prev.map(item =>
        item.id === a.id ? {
          ...item,
          attendanceStatus: 'present', attendance_status: 'present',
          paymentStatus: 'paid', payment_status: 'paid',
        } : item
      ));
      toast.success(`${getName(a)} の受付完了`);
    } catch {
      toast.error('更新に失敗しました');
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(a.id); return s; });
    }
  };

  const handleAbsent = async (a: AttendanceItem) => {
    setLoadingIds(prev => new Set([...prev, a.id]));
    try {
      const res = await fetch(`/api/attendances/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendanceStatus: 'absent' }),
      });
      if (!res.ok) throw new Error();
      setAttendances(prev => prev.map(item =>
        item.id === a.id ? { ...item, attendanceStatus: 'absent', attendance_status: 'absent' } : item
      ));
      toast.success('欠席に設定しました');
    } catch {
      toast.error('更新に失敗しました');
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(a.id); return s; });
    }
  };

  // 集計
  const activeAttendances = attendances.filter(a => {
    const pt = getParticipationType(a);
    return pt !== 'absent' && pt !== 'waitlist';
  });
  const presentCount = activeAttendances.filter(a => getAttendanceStatus(a) === 'present').length;
  const undecidedCount = activeAttendances.filter(a => getAttendanceStatus(a) === 'undecided').length;
  const paidCount = attendances.filter(a => getPaymentStatus(a) === 'paid').length;
  const totalFee = attendances
    .filter(a => getPaymentStatus(a) === 'paid')
    .reduce((s, a) => s + getFeeAmount(a), 0);

  // 自クラブ会員 / 外部参加者 に分離
  const ownClubMembers = attendances.filter(a => getUserId(a) !== null);
  const externalMembers = attendances.filter(a => getUserId(a) === null);

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
            {/* 手動登録ボタン */}
            <Button
              size="sm"
              onClick={openManualForm}
              disabled={!selectedMeetingId}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <UserPlus className="h-4 w-4" />
              手動登録
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
      {loading ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">読み込み中...</CardContent>
        </Card>
      ) : attendances.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-3 text-gray-200" />
            <p className="mb-4">登録者がいません</p>
            <Button
              onClick={openManualForm}
              disabled={!selectedMeetingId}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <UserPlus className="h-4 w-4" />
              最初の参加者を手動登録
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* 自クラブ会員セクション */}
          {ownClubMembers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  自クラブ会員
                  <Badge variant="secondary" className="text-xs">{ownClubMembers.length}名</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ownClubMembers.map(a => (
                    <AttendanceRow
                      key={a.id}
                      a={a}
                      loadingIds={loadingIds}
                      onCheckin={handleCheckin}
                      onAbsent={handleAbsent}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 外部参加者セクション */}
          {externalMembers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-purple-600" />
                  外部参加者
                  <Badge variant="secondary" className="text-xs">{externalMembers.length}名</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {externalMembers.map(a => (
                    <AttendanceRow
                      key={a.id}
                      a={a}
                      loadingIds={loadingIds}
                      onCheckin={handleCheckin}
                      onAbsent={handleAbsent}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ========== 手動登録モーダル ========== */}
      {showManualForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">

            {/* ヘッダー */}
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-blue-600" />
                <h2 className="font-bold text-gray-900 text-base">参加者を手動登録</h2>
              </div>
              <button
                onClick={closeManualForm}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 例会名表示 */}
            {selectedMeeting && (
              <div className="px-5 py-2 bg-blue-50 border-b flex-shrink-0">
                <p className="text-xs text-blue-700 font-medium">
                  {selectedMeeting.title}（{formatDate(selectedMeeting.date)}）
                </p>
              </div>
            )}

            {/* フォーム本体（スクロール可） */}
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">

              {/* 氏名（必須） */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  氏名 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={manualForm.name}
                  onChange={e => updateFormField('name', e.target.value)}
                  placeholder="例: 山田 太郎"
                  className="text-base"
                  autoFocus
                />
              </div>

              {/* 電話番号 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  電話番号
                  <span className="ml-1 text-xs text-gray-400 font-normal">（任意）</span>
                </label>
                <Input
                  type="tel"
                  value={manualForm.phone}
                  onChange={e => updateFormField('phone', e.target.value)}
                  placeholder="例: 090-1234-5678"
                />
              </div>

              {/* 所属クラブ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  所属クラブ
                  <span className="ml-1 text-xs text-gray-400 font-normal">（任意）</span>
                </label>
                <Input
                  value={manualForm.clubName}
                  onChange={e => updateFormField('clubName', e.target.value)}
                  placeholder="例: ○○ローターアクトクラブ"
                />
              </div>

              {/* 区分 + 参加形態 — 横並び */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">区分</label>
                  <Select
                    value={manualForm.memberType}
                    onValueChange={v => updateFormField('memberType', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RAC">RAC</SelectItem>
                      <SelectItem value="RC">RC</SelectItem>
                      <SelectItem value="OB_OG">OB・OG</SelectItem>
                      <SelectItem value="GUEST">ゲスト</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">参加形態</label>
                  <Select
                    value={manualForm.participationType}
                    onValueChange={v => updateFormField('participationType', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meeting_only">例会のみ</SelectItem>
                      {selectedMeeting?.hasAfterParty && (
                        <SelectItem value="meeting_and_party">例会＋懇親会</SelectItem>
                      )}
                      <SelectItem value="absent">欠席</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 登録料 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  登録料
                  {!manualForm.feeOverride && (
                    <span className="ml-1 text-xs text-blue-500 font-normal">（自動計算）</span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">¥</span>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={manualForm.feeAmount}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      setManualForm(prev => ({ ...prev, feeAmount: val, feeOverride: true }));
                    }}
                    className="flex-1"
                  />
                  {manualForm.feeOverride && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedMeeting) return;
                        const fee = calcFee(
                          selectedMeeting,
                          manualForm.memberType,
                          manualForm.participationType,
                          false,
                        );
                        setManualForm(prev => ({ ...prev, feeAmount: fee, feeOverride: false }));
                      }}
                      className="text-xs text-blue-500 hover:underline whitespace-nowrap"
                    >
                      自動計算に戻す
                    </button>
                  )}
                </div>
              </div>

              {/* メモ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  メモ
                  <span className="ml-1 text-xs text-gray-400 font-normal">（任意）</span>
                </label>
                <textarea
                  value={manualForm.note}
                  onChange={e => setManualForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="電話受付、紹介者名など"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* 受付即時完了オプション */}
              <div className={`rounded-xl p-4 border-2 transition-colors ${
                manualForm.checkinNow
                  ? 'bg-green-50 border-green-300'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualForm.checkinNow}
                    onChange={e => setManualForm(prev => ({ ...prev, checkinNow: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <div>
                    <p className={`text-sm font-medium ${manualForm.checkinNow ? 'text-green-700' : 'text-gray-700'}`}>
                      登録と同時に受付済みにする
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      チェックすると出席・支払済（現金）として即時登録されます
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* フッター */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
              <Button variant="outline" onClick={closeManualForm} disabled={manualSaving}>
                キャンセル
              </Button>
              <Button
                onClick={handleManualSubmit}
                disabled={manualSaving || !manualForm.name.trim()}
                className={manualForm.checkinNow
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'}
              >
                {manualSaving ? '登録中...' : manualForm.checkinNow ? '登録して受付' : '登録する'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- 個別の受付行コンポーネント ----
function AttendanceRow({
  a, loadingIds, onCheckin, onAbsent,
}: {
  a: AttendanceItem;
  loadingIds: Set<string>;
  onCheckin: (a: AttendanceItem) => void;
  onAbsent: (a: AttendanceItem) => void;
}) {
  const name = getName(a);
  const attendanceStatus = getAttendanceStatus(a);
  const paymentStatus = getPaymentStatus(a);
  const feeAmount = getFeeAmount(a);
  const memberType = getMemberType(a);
  const clubName = getClubName(a);
  const participationType = getParticipationType(a);
  const isPresent = attendanceStatus === 'present';
  const isAbsent = attendanceStatus === 'absent';
  const isPaid = paymentStatus === 'paid';
  const isLoading = loadingIds.has(a.id);
  const isAbsentType = participationType === 'absent';

  const PARTICIPATION_LABELS: Record<string, string> = {
    meeting_only: '例会のみ',
    meeting_and_party: '例会＋懇親会',
    absent: '欠席',
    waitlist: 'キャンセル待ち',
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        isPresent ? 'bg-green-50 border-green-200' :
        isAbsent || isAbsentType ? 'bg-gray-50 border-gray-200 opacity-60' :
        'bg-white border-gray-200'
      }`}
    >
      {/* 状態アイコン */}
      <div className="flex-shrink-0">
        {isPresent ? (
          <CheckCircle2 className="h-6 w-6 text-green-500" />
        ) : isAbsent || isAbsentType ? (
          <XCircle className="h-6 w-6 text-gray-400" />
        ) : (
          <Clock className="h-6 w-6 text-yellow-400" />
        )}
      </div>

      {/* 名前・情報 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-sm ${isAbsent || isAbsentType ? 'line-through text-gray-400' : ''}`}>
            {name}
          </span>
          <span className="text-xs text-gray-400">
            {MEMBER_TYPE_LABELS[memberType] ?? memberType}
          </span>
          {participationType !== 'meeting_only' && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              participationType === 'meeting_and_party' ? 'bg-purple-100 text-purple-600' :
              participationType === 'absent' ? 'bg-red-100 text-red-600' :
              'bg-yellow-100 text-yellow-600'
            }`}>
              {PARTICIPATION_LABELS[participationType] ?? participationType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {clubName && (
            <span className="text-xs text-gray-400">{clubName}</span>
          )}
          <span className="text-xs text-gray-500">
            参加費: {formatCurrency(feeAmount)}
          </span>
          {isPaid && (
            <span className="text-xs text-green-600 font-medium">✓ 支払済</span>
          )}
          {(a.receiptRequired || a.receipt_required) && (
            <span className="text-xs text-blue-500">領収書希望</span>
          )}
        </div>
      </div>

      {/* 操作ボタン */}
      {!isAbsentType && (
        <>
          {!isPresent && !isAbsent ? (
            <div className="flex gap-2 flex-shrink-0">
              <Button size="sm"
                onClick={() => onCheckin(a)}
                disabled={isLoading}
                className="text-xs bg-green-600 hover:bg-green-700 text-white h-8 px-3"
              >
                {isLoading ? '...' : '受付'}
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => onAbsent(a)}
                disabled={isLoading}
                className="text-xs h-8 px-2"
              >
                欠席
              </Button>
            </div>
          ) : isPresent ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-medium text-green-600">受付済</span>
              <Button size="sm" variant="ghost"
                onClick={() => onAbsent(a)}
                disabled={isLoading}
                className="text-xs h-7 px-2 text-gray-400 hover:text-red-600"
              >
                取消
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-gray-400">欠席</span>
              <Button size="sm" variant="ghost"
                onClick={() => onCheckin(a)}
                disabled={isLoading}
                className="text-xs h-7 px-2 text-gray-400 hover:text-green-600"
              >
                受付
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
