'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { calculateFee, formatDate, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Calendar, MapPin, Clock, Users, AlertTriangle, LogIn, PartyPopper } from 'lucide-react';
import type { Meeting, Club, MemberType } from '@/types';

// 役職の選択肢
const POSITION_OPTIONS = [
  { value: '', label: '（役職なし）' },
  { value: '会長', label: '会長' },
  { value: '副会長', label: '副会長' },
  { value: '幹事', label: '幹事' },
  { value: '会計', label: '会計' },
  { value: 'custom', label: 'その他（記述）' },
] as const;

const muSchema = z.object({
  name: z.string().min(1, 'お名前は必須です'),
  name_kana: z.string().optional(),
  club_id: z.string().optional(),
  club_name: z.string().min(1, '所属クラブは必須です'),
  member_type: z.enum(['RAC', 'RC', 'OB_OG', 'GUEST', 'OTHER']),
  email: z.string().email('正しいメールアドレスを入力してください'),
  phone: z.string().optional(),
  meal_required: z.boolean().default(false),
  // 参加形態: 例会のみ / 例会+懇親会 / 懇親会のみ
  participation_type: z.enum(['meeting_only', 'meeting_and_party', 'party_only']).default('meeting_only'),
  // 役職
  position_select: z.string().optional(),
  position_custom: z.string().optional(),
  receipt_required: z.boolean().default(false),
  receipt_name_type: z.enum(['club', 'personal', 'custom']).optional(),
  receipt_name: z.string().optional(),
  note: z.string().optional(),
});

type MuFormData = z.infer<typeof muSchema>;

interface LoggedInUser {
  id: string;
  name: string;
  email: string;
  clubId: string | null;
  clubName: string | null;
}

// Meeting型を拡張して懇親会フィールドを含める
type MeetingWithParty = Meeting & {
  club?: { name: string; short_name?: string };
  has_after_party?: boolean;
  after_party_venue?: string | null;
  after_party_start_time?: string | null;
  after_party_fee_rac?: number;
  after_party_fee_rc?: number;
  after_party_fee_obog?: number;
  after_party_fee_guest?: number;
  after_party_capacity?: number | null;
  capacity?: number | null;
};

interface MuRegistrationFormProps {
  meeting: MeetingWithParty;
  clubs: Club[];
  loggedInUser?: LoggedInUser | null;
}

/** 懇親会参加費を区分から算出 */
function calcAfterPartyFee(memberType: string, meeting: MeetingWithParty): number {
  switch (memberType) {
    case 'RAC':   return meeting.after_party_fee_rac  ?? 0;
    case 'RC':    return meeting.after_party_fee_rc   ?? 0;
    case 'OB_OG': return meeting.after_party_fee_obog ?? 0;
    default:      return meeting.after_party_fee_guest ?? 0;
  }
}

export default function MuRegistrationForm({ meeting, clubs, loggedInUser }: MuRegistrationFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registrationData, setRegistrationData] = useState<{
    name: string;
    feeAmount: number;
    afterPartyFeeAmount: number;
    participationType: string;
    email: string;
  } | null>(null);

  const hasAfterParty = !!(meeting.has_after_party);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MuFormData>({
    resolver: zodResolver(muSchema) as any,
    defaultValues: {
      member_type: 'RAC',
      meal_required: false,
      receipt_required: false,
      participation_type: 'meeting_only',
      name: loggedInUser?.name ?? '',
      email: loggedInUser?.email ?? '',
      club_id: loggedInUser?.clubId ?? '',
      club_name: loggedInUser?.clubName ?? '',
    },
  });

  const memberType = watch('member_type');
  const mealRequired = watch('meal_required');
  const receiptRequired = watch('receipt_required');
  const receiptNameType = watch('receipt_name_type');
  const participationType = watch('participation_type');
  const positionSelect = watch('position_select');
  const positionCustom = watch('position_custom');

  // 例会登録料（meeting_only / meeting_and_party の場合）
  const meetingFee = participationType === 'party_only'
    ? 0
    : calculateFee(memberType, meeting, mealRequired, meeting.meal_fee);

  // 懇親会登録料
  const afterPartyFee = (hasAfterParty && (participationType === 'meeting_and_party' || participationType === 'party_only'))
    ? calcAfterPartyFee(memberType, meeting)
    : 0;

  const totalFee = meetingFee + afterPartyFee;

  const participationLabel: Record<string, string> = {
    meeting_only: '例会のみ',
    meeting_and_party: '例会＋懇親会',
    party_only: '懇親会のみ',
  };

  const onSubmit = async (data: MuFormData) => {
    setLoading(true);

    // 役職の解決（selected + custom）
    const resolvedPosition =
      data.position_select === 'custom'
        ? (data.position_custom?.trim() || '')
        : (data.position_select || '');

    // note に役職を付加
    const noteWithPosition = [
      resolvedPosition ? `【役職】${resolvedPosition}` : '',
      data.note?.trim() || '',
    ].filter(Boolean).join('\n');

    try {
      const res = await fetch('/api/attendances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meeting.id,
          userId: loggedInUser?.id ?? null,
          clubId: data.club_id || null,
          clubName: data.club_name,
          externalName: loggedInUser ? null : data.name,
          externalEmail: loggedInUser ? null : data.email,
          externalPhone: data.phone || null,
          memberType: data.member_type,
          attendanceStatus: 'undecided',
          registrationType: 'mu',
          mealRequired: data.meal_required,
          feeAmount: meetingFee,
          paymentStatus: 'unpaid',
          // 参加形態
          participationType: data.participation_type,
          afterPartyFeeAmount: afterPartyFee,
          receiptRequired: data.receipt_required,
          receiptNameType: data.receipt_required ? (data.receipt_name_type || null) : null,
          receiptName: data.receipt_required ? (data.receipt_name || data.name) : null,
          note: noteWithPosition || null,
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        if (resData.error?.includes('重複') || resData.error?.includes('UNIQUE')) {
          toast.error('すでに登録済みです', { description: 'この例会はすでに登録されています' });
          setLoading(false);
          return;
        }
        throw new Error(resData.error);
      }

      // 登録完了メール送信（失敗しても続行）
      await fetch('/api/emails/send-registration-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meeting.id,
          name: data.name,
          email: data.email,
          feeAmount: totalFee,
          mealRequired: data.meal_required,
          participationType: data.participation_type,
        }),
      }).catch(() => {});

      setRegistrationData({
        name: data.name,
        feeAmount: meetingFee,
        afterPartyFeeAmount: afterPartyFee,
        participationType: data.participation_type,
        email: data.email,
      });
      setSubmitted(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '登録に失敗しました';
      toast.error('エラーが発生しました', { description: message });
    } finally {
      setLoading(false);
    }
  };

  // 登録完了画面
  if (submitted && registrationData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardContent className="pt-8 pb-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">登録が完了しました</h2>
            <p className="text-gray-600 text-sm mb-4">
              {registrationData.name} 様のご登録を承りました。
            </p>

            <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">例会名</span>
                <span className="font-medium">{meeting.title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">開催日</span>
                <span className="font-medium">{formatDate(meeting.date)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">参加形態</span>
                <span className="font-medium">{participationLabel[registrationData.participationType] ?? registrationData.participationType}</span>
              </div>
              {registrationData.feeAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">例会登録料</span>
                  <span className="font-bold text-blue-600">{formatCurrency(registrationData.feeAmount)}</span>
                </div>
              )}
              {registrationData.afterPartyFeeAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">懇親会参加費</span>
                  <span className="font-bold text-purple-600">{formatCurrency(registrationData.afterPartyFeeAmount)}</span>
                </div>
              )}
              {(registrationData.feeAmount + registrationData.afterPartyFeeAmount) > 0 && (
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
                  <span className="text-gray-700 font-medium">合計</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(registrationData.feeAmount + registrationData.afterPartyFeeAmount)}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500">
              確認メールを {registrationData.email} へ送信しました。
            </p>
            <p className="text-xs text-gray-400 mt-1">
              当日の受付でお名前をお伝えください。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-blue-600 text-white py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <p className="text-blue-200 text-sm mb-1">{meeting.club?.name}</p>
          <h1 className="text-2xl font-bold mb-3">{meeting.title}</h1>
          {meeting.theme && (
            <p className="text-blue-100 text-sm">テーマ: {meeting.theme}</p>
          )}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-blue-100 text-sm">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(meeting.date)}</span>
            </div>
            {meeting.start_time && (
              <div className="flex items-center gap-2 text-blue-100 text-sm">
                <Clock className="h-4 w-4" />
                <span>
                  {meeting.start_time.substring(0, 5)}
                  {meeting.end_time && ` 〜 ${meeting.end_time.substring(0, 5)}`}
                </span>
              </div>
            )}
            {meeting.venue_name && (
              <div className="flex items-center gap-2 text-blue-100 text-sm">
                <MapPin className="h-4 w-4" />
                <span>{meeting.venue_name}</span>
              </div>
            )}
          </div>

          {/* 懇親会情報ヘッダー */}
          {hasAfterParty && (
            <div className="mt-4 bg-purple-700 bg-opacity-50 rounded-lg px-4 py-3 flex items-start gap-2">
              <PartyPopper className="h-4 w-4 text-purple-200 mt-0.5 shrink-0" />
              <div className="text-sm text-purple-100">
                <span className="font-semibold text-white">懇親会あり</span>
                {meeting.after_party_venue && (
                  <span className="ml-2">{meeting.after_party_venue}</span>
                )}
                {meeting.after_party_start_time && (
                  <span className="ml-2">{meeting.after_party_start_time.substring(0, 5)} 〜</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 登録料表示 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <p className="text-sm font-medium text-gray-700 mb-2">例会登録料</p>
          <div className="flex flex-wrap gap-3">
            {meeting.fee_rac > 0 && <FeeChip label="RAC" amount={meeting.fee_rac} />}
            {meeting.fee_rc > 0 && <FeeChip label="RC" amount={meeting.fee_rc} />}
            {meeting.fee_obog > 0 && <FeeChip label="OB・OG" amount={meeting.fee_obog} />}
            {meeting.fee_guest > 0 && <FeeChip label="ゲスト" amount={meeting.fee_guest} />}
            {meeting.meal_fee > 0 && <FeeChip label="お弁当代" amount={meeting.meal_fee} suffix="（別途）" />}
          </div>
          {hasAfterParty && (
            <>
              <p className="text-sm font-medium text-gray-700 mb-2 mt-3">懇親会参加費</p>
              <div className="flex flex-wrap gap-3">
                {(meeting.after_party_fee_rac ?? 0) > 0 && <FeeChip label="RAC" amount={meeting.after_party_fee_rac!} color="purple" />}
                {(meeting.after_party_fee_rc ?? 0) > 0 && <FeeChip label="RC" amount={meeting.after_party_fee_rc!} color="purple" />}
                {(meeting.after_party_fee_obog ?? 0) > 0 && <FeeChip label="OB・OG" amount={meeting.after_party_fee_obog!} color="purple" />}
                {(meeting.after_party_fee_guest ?? 0) > 0 && <FeeChip label="ゲスト" amount={meeting.after_party_fee_guest!} color="purple" />}
              </div>
            </>
          )}
        </div>
      </div>

      {/* フォーム */}
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* ログイン済みバナー */}
        {loggedInUser ? (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <LogIn className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">
                {loggedInUser.name} さんとしてログイン中
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                お名前・メール・所属クラブを自動入力しました。参加登録は会員情報と紐づけて記録されます。
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <LogIn className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                会員の方はログインすると便利です
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                ログインすると情報が自動入力され、参加履歴もマイページで確認できます。
                <a href="/login" className="underline ml-1">ログインする →</a>
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">

          {/* 参加者情報 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                参加者情報
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <Label htmlFor="name" required>お名前</Label>
                  <Input
                    id="name"
                    {...register('name')}
                    placeholder="山田 太郎"
                    error={errors.name?.message}
                    className="mt-1"
                    readOnly={!!loggedInUser}
                  />
                </div>

                <div className="form-group">
                  <Label htmlFor="name_kana">ふりがな</Label>
                  <Input
                    id="name_kana"
                    {...register('name_kana')}
                    placeholder="やまだ たろう"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="form-group">
                <Label required>区分</Label>
                <Select
                  onValueChange={v => setValue('member_type', v as MemberType)}
                  defaultValue="RAC"
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RAC">ローターアクター（RAC）</SelectItem>
                    <SelectItem value="RC">ロータリアン（RC）</SelectItem>
                    <SelectItem value="OB_OG">OB・OG</SelectItem>
                    <SelectItem value="GUEST">ゲスト</SelectItem>
                    <SelectItem value="OTHER">その他</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 役職 */}
              <div className="form-group">
                <Label htmlFor="position_select">役職</Label>
                <Select
                  onValueChange={v => {
                    setValue('position_select', v);
                    if (v !== 'custom') setValue('position_custom', '');
                  }}
                  defaultValue=""
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="役職を選択（任意）" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITION_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {positionSelect === 'custom' && (
                  <input
                    type="text"
                    {...register('position_custom')}
                    placeholder="役職名を入力してください"
                    className="mt-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                )}
              </div>

              <div className="form-group">
                <Label htmlFor="club_name" required>所属クラブ</Label>
                {loggedInUser?.clubName ? (
                  <div className="mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
                    {loggedInUser.clubName}
                  </div>
                ) : (
                  <div className="mt-1 space-y-2">
                    <Select onValueChange={v => {
                      setValue('club_id', v);
                      const club = clubs.find(c => c.id === v);
                      if (club) setValue('club_name', club.name);
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="クラブを選択..." />
                      </SelectTrigger>
                      <SelectContent>
                        {clubs.map(club => (
                          <SelectItem key={club.id} value={club.id}>
                            {club.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      id="club_name"
                      {...register('club_name')}
                      placeholder="一覧にない場合はこちらに入力"
                      error={errors.club_name?.message}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 連絡先情報 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">連絡先情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="form-group">
                <Label htmlFor="email" required>メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  placeholder="example@racclub.jp"
                  error={errors.email?.message}
                  className="mt-1"
                  readOnly={!!loggedInUser}
                />
              </div>

              <div className="form-group">
                <Label htmlFor="phone">電話番号</Label>
                <Input
                  id="phone"
                  type="tel"
                  {...register('phone')}
                  placeholder="090-0000-0000"
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* 参加形態（懇親会がある場合のみ表示） */}
          {hasAfterParty && (
            <Card className="border-purple-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PartyPopper className="h-4 w-4 text-purple-500" />
                  参加形態
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    value: 'meeting_only',
                    label: '例会のみ参加',
                    desc: '例会にのみ参加します',
                    fee: calculateFee(memberType, meeting, false, 0),
                  },
                  {
                    value: 'meeting_and_party',
                    label: '例会＋懇親会に参加',
                    desc: `例会と懇親会の両方に参加します`,
                    fee: calculateFee(memberType, meeting, false, 0) + calcAfterPartyFee(memberType, meeting),
                  },
                  {
                    value: 'party_only',
                    label: '懇親会のみ参加',
                    desc: '懇親会にのみ参加します',
                    fee: calcAfterPartyFee(memberType, meeting),
                  },
                ].map(option => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      participationType === option.value
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      value={option.value}
                      checked={participationType === option.value}
                      onChange={() => setValue('participation_type', option.value as any)}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{option.label}</span>
                        {option.fee > 0 && (
                          <span className="text-sm font-bold text-purple-700">{formatCurrency(option.fee)}</span>
                        )}
                        {option.fee === 0 && (
                          <span className="text-sm text-gray-500">無料</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{option.desc}</p>
                      {option.value === 'meeting_and_party' && meeting.after_party_venue && (
                        <p className="text-xs text-purple-600 mt-0.5">
                          📍 {meeting.after_party_venue}
                          {meeting.after_party_start_time && ` ${meeting.after_party_start_time.substring(0, 5)}〜`}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          {/* オプション */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">オプション</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {meeting.meal_fee > 0 && participationType !== 'party_only' && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    id="meal_required"
                    {...register('meal_required')}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="meal_required" className="text-sm text-gray-700 cursor-pointer">
                    お弁当を希望する（{formatCurrency(meeting.meal_fee)}）
                  </label>
                </div>
              )}

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <input
                  type="checkbox"
                  id="receipt_required"
                  {...register('receipt_required')}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="receipt_required" className="text-sm text-gray-700 cursor-pointer">
                  領収書を希望する
                </label>
              </div>

              {receiptRequired && (
                <div className="space-y-3 pl-8">
                  <div className="form-group">
                    <Label>領収書宛名</Label>
                    <Select
                      onValueChange={v => setValue('receipt_name_type', v as 'club' | 'personal' | 'custom')}
                      defaultValue="personal"
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="club">所属クラブ名</SelectItem>
                        <SelectItem value="personal">個人名</SelectItem>
                        <SelectItem value="custom">自由入力</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {receiptNameType === 'custom' && (
                    <div className="form-group">
                      <Label>宛名を入力</Label>
                      <Input
                        {...register('receipt_name')}
                        placeholder="領収書の宛名"
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 備考 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">備考</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                {...register('note')}
                placeholder="アレルギーや連絡事項など"
                rows={3}
              />
            </CardContent>
          </Card>

          {/* 登録料確認 */}
          {totalFee > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="text-sm text-blue-700 font-medium flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                お支払い金額のご確認
              </p>
              {meetingFee > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-blue-600">
                    例会登録料{mealRequired ? '（お弁当含む）' : ''}
                  </span>
                  <span className="font-semibold text-blue-700">{formatCurrency(meetingFee)}</span>
                </div>
              )}
              {afterPartyFee > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-purple-600">懇親会参加費</span>
                  <span className="font-semibold text-purple-700">{formatCurrency(afterPartyFee)}</span>
                </div>
              )}
              {meetingFee > 0 && afterPartyFee > 0 && (
                <div className="flex justify-between items-center border-t border-blue-200 pt-2">
                  <span className="text-blue-700 font-medium">合計</span>
                  <span className="text-lg font-bold text-blue-700">{formatCurrency(totalFee)}</span>
                </div>
              )}
              {!(meetingFee > 0 && afterPartyFee > 0) && (
                <div className="flex justify-between items-center">
                  <span className="text-blue-600 text-sm">合計</span>
                  <span className="text-lg font-bold text-blue-700">{formatCurrency(totalFee)}</span>
                </div>
              )}
              <p className="text-xs text-blue-500">※当日、受付にてお支払いください</p>
            </div>
          )}

          <Button
            type="submit"
            loading={loading}
            size="xl"
            className="w-full"
          >
            登録する
          </Button>

          <p className="text-xs text-gray-500 text-center">
            登録いただいた情報は、例会運営のためにのみ使用します。
          </p>
        </form>
      </div>
    </div>
  );
}

function FeeChip({
  label, amount, suffix = '', color = 'gray'
}: {
  label: string; amount: number; suffix?: string; color?: 'gray' | 'purple';
}) {
  return (
    <div className={`flex items-center gap-1 bg-white border rounded-full px-3 py-1 ${
      color === 'purple' ? 'border-purple-200' : 'border-gray-200'
    }`}>
      <span className="text-xs text-gray-500">{label}:</span>
      <span className={`text-sm font-semibold ${
        color === 'purple' ? 'text-purple-700' : 'text-gray-900'
      }`}>{formatCurrency(amount)}{suffix}</span>
    </div>
  );
}
