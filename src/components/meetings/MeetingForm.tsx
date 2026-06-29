'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { generateSlug } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, PartyPopper, Users, Link2, Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { Meeting } from '@/types';

const meetingSchema = z.object({
  title: z.string().min(1, '例会名は必須です'),
  meeting_number: z.string().optional(),
  theme: z.string().optional(),
  date: z.string().min(1, '開催日は必須です'),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  venue_name: z.string().optional(),
  venue_address: z.string().optional(),
  committee: z.string().optional(),
  manager_user_id: z.string().optional(),
  description: z.string().optional(),
  program_detail: z.string().optional(),
  registration_deadline: z.string().optional(),
  fee_rac: z.string().default('0'),
  fee_rc: z.string().default('0'),
  fee_obog: z.string().default('0'),
  fee_guest: z.string().default('0'),
  meal_fee: z.string().default('0'),
  status: z.enum(['draft', 'open', 'closed', 'finished', 'cancelled']),
  note: z.string().optional(),
  // 定員
  capacity: z.string().optional(),
  // 懇親会
  has_after_party: z.boolean().default(false),
  after_party_venue: z.string().optional(),
  after_party_start_time: z.string().optional(),
  after_party_fee_rac: z.string().default('0'),
  after_party_fee_rc: z.string().default('0'),
  after_party_fee_obog: z.string().default('0'),
  after_party_fee_guest: z.string().default('0'),
  after_party_capacity: z.string().optional(),
});

type MeetingFormData = z.infer<typeof meetingSchema>;

interface MeetingFormProps {
  mode: 'create' | 'edit';
  clubId: string;
  meeting?: Meeting;
  members: { id: string; name: string }[];
}

export default function MeetingForm({ mode, clubId, meeting, members }: MeetingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // 編集モード時のMU登録URL（作成済みのslugから生成）
  const existingMuUrl = mode === 'edit' && (meeting as any)?.mu_registration_slug
    ? (typeof window !== 'undefined'
        ? `${window.location.origin}/mu/${(meeting as any).mu_registration_slug}`
        : (meeting as any)?.mu_registration_url || null)
    : null;

  const copyMuUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toast.success('MU登録URLをコピーしました');
    });
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MeetingFormData>({
    resolver: zodResolver(meetingSchema) as any,
    defaultValues: {
      title: meeting?.title || '',
      meeting_number: meeting?.meeting_number?.toString() || '',
      theme: meeting?.theme || '',
      date: meeting?.date || '',
      start_time: meeting?.start_time?.substring(0, 5) || '',
      end_time: meeting?.end_time?.substring(0, 5) || '',
      venue_name: meeting?.venue_name || '',
      venue_address: meeting?.venue_address || '',
      committee: meeting?.committee || '',
      manager_user_id: meeting?.manager_user_id || '',
      description: meeting?.description || '',
      program_detail: meeting?.program_detail || '',
      registration_deadline: meeting?.registration_deadline || '',
      fee_rac: meeting?.fee_rac?.toString() || '0',
      fee_rc: meeting?.fee_rc?.toString() || '0',
      fee_obog: meeting?.fee_obog?.toString() || '0',
      fee_guest: meeting?.fee_guest?.toString() || '0',
      meal_fee: meeting?.meal_fee?.toString() || '0',
      status: (meeting?.status as MeetingFormData['status']) || 'draft',
      note: meeting?.note || '',
      capacity: (meeting as any)?.capacity?.toString() || '',
      has_after_party: (meeting as any)?.has_after_party || false,
      after_party_venue: (meeting as any)?.after_party_venue || '',
      after_party_start_time: (meeting as any)?.after_party_start_time?.substring(0, 5) || '',
      after_party_fee_rac: (meeting as any)?.after_party_fee_rac?.toString() || '0',
      after_party_fee_rc: (meeting as any)?.after_party_fee_rc?.toString() || '0',
      after_party_fee_obog: (meeting as any)?.after_party_fee_obog?.toString() || '0',
      after_party_fee_guest: (meeting as any)?.after_party_fee_guest?.toString() || '0',
      after_party_capacity: (meeting as any)?.after_party_capacity?.toString() || '',
    },
  });

  const hasAfterParty = watch('has_after_party');

  const onSubmit = async (data: MeetingFormData) => {
    setLoading(true);
    
    try {
      const slug = (meeting as any)?.mu_registration_slug || generateSlug();
      const baseUrl = window.location.origin;
      const registrationUrl = `${baseUrl}/mu/${slug}`;

      const commonPayload = {
        title: data.title,
        meetingNumber: data.meeting_number ? parseInt(data.meeting_number) : null,
        theme: data.theme || null,
        date: data.date,
        startTime: data.start_time || null,
        endTime: data.end_time || null,
        venueName: data.venue_name || null,
        venueAddress: data.venue_address || null,
        committee: data.committee || null,
        managerUserId: data.manager_user_id || null,
        description: data.description || null,
        programDetail: data.program_detail || null,
        registrationDeadline: data.registration_deadline || null,
        feeRac: parseInt(data.fee_rac) || 0,
        feeRc: parseInt(data.fee_rc) || 0,
        feeObog: parseInt(data.fee_obog) || 0,
        feeGuest: parseInt(data.fee_guest) || 0,
        mealFee: parseInt(data.meal_fee) || 0,
        status: data.status,
        note: data.note || null,
        // 定員
        capacity: data.capacity ? parseInt(data.capacity) : null,
        // 懇親会
        hasAfterParty: data.has_after_party,
        afterPartyVenue: data.has_after_party ? (data.after_party_venue || null) : null,
        afterPartyStartTime: data.has_after_party ? (data.after_party_start_time || null) : null,
        afterPartyFeeRac: data.has_after_party ? (parseInt(data.after_party_fee_rac) || 0) : 0,
        afterPartyFeeRc: data.has_after_party ? (parseInt(data.after_party_fee_rc) || 0) : 0,
        afterPartyFeeObog: data.has_after_party ? (parseInt(data.after_party_fee_obog) || 0) : 0,
        afterPartyFeeGuest: data.has_after_party ? (parseInt(data.after_party_fee_guest) || 0) : 0,
        afterPartyCapacity: data.has_after_party && data.after_party_capacity ? parseInt(data.after_party_capacity) : null,
      };

      if (mode === 'create') {
        const res = await fetch('/api/meetings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clubId,
            muRegistrationSlug: slug,
            muRegistrationUrl: registrationUrl,
            ...commonPayload,
          }),
        });
        const newData = await res.json();
        if (!res.ok) throw new Error(newData.error);
        toast.success('例会を作成しました', { description: `MU登録URL: ${registrationUrl}` });
        router.push(`/meetings/${newData.meeting?.id || newData.id}`);
      } else if (meeting) {
        const res = await fetch(`/api/meetings/${meeting.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(commonPayload),
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error);
        toast.success('例会を更新しました');
        router.push(`/meetings/${meeting.id}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '保存に失敗しました';
      toast.error('エラーが発生しました', { description: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/meetings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            戻る
          </Button>
        </Link>
        <h1 className="page-title">
          {mode === 'create' ? '例会を作成' : '例会を編集'}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-group md:col-span-2">
                <Label required>例会名</Label>
                <Input
                  {...register('title')}
                  placeholder="第〇〇例会 例会テーマ"
                  error={errors.title?.message}
                  className="mt-1"
                />
              </div>

              <div className="form-group">
                <Label>例会番号</Label>
                <Input
                  {...register('meeting_number')}
                  type="number"
                  placeholder="例: 12"
                  className="mt-1"
                />
              </div>

              <div className="form-group">
                <Label>例会テーマ</Label>
                <Input
                  {...register('theme')}
                  placeholder="テーマを入力"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="form-group">
                <Label required>開催日</Label>
                <Input
                  {...register('date')}
                  type="date"
                  error={errors.date?.message}
                  className="mt-1"
                />
              </div>

              <div className="form-group">
                <Label>開始時間</Label>
                <Input
                  {...register('start_time')}
                  type="time"
                  className="mt-1"
                />
              </div>

              <div className="form-group">
                <Label>終了時間</Label>
                <Input
                  {...register('end_time')}
                  type="time"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-group">
                <Label>会場名</Label>
                <Input
                  {...register('venue_name')}
                  placeholder="〇〇ホール"
                  className="mt-1"
                />
              </div>

              <div className="form-group">
                <Label>会場住所</Label>
                <Input
                  {...register('venue_address')}
                  placeholder="大阪府〇〇区〇〇町1-1-1"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="form-group">
                <Label>担当委員会</Label>
                <Input
                  {...register('committee')}
                  placeholder="〇〇委員会"
                  className="mt-1"
                />
              </div>

              <div className="form-group">
                <Label>担当者</Label>
                <Select onValueChange={v => setValue('manager_user_id', v)} defaultValue={watch('manager_user_id')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="担当者を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="form-group">
                <Label>登録締切日</Label>
                <Input
                  {...register('registration_deadline')}
                  type="date"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-group">
                <Label>ステータス</Label>
                <Select onValueChange={v => setValue('status', v as MeetingFormData['status'])} defaultValue={watch('status')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">下書き</SelectItem>
                    <SelectItem value="open">募集中</SelectItem>
                    <SelectItem value="closed">締切</SelectItem>
                    <SelectItem value="finished">終了</SelectItem>
                    <SelectItem value="cancelled">中止</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="form-group">
                <Label className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  例会定員（空欄=無制限）
                </Label>
                <div className="relative mt-1">
                  <Input
                    {...register('capacity')}
                    type="number"
                    min="1"
                    placeholder="例: 30"
                    className="pr-6"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">名</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 登録料設定 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">登録料設定</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: 'fee_rac', label: 'RAC登録料' },
                { key: 'fee_rc', label: 'RC登録料' },
                { key: 'fee_obog', label: 'OB・OG登録料' },
                { key: 'fee_guest', label: 'ゲスト登録料' },
              ].map(({ key, label }) => (
                <div key={key} className="form-group">
                  <Label>{label}</Label>
                  <div className="relative mt-1">
                    <Input
                      {...register(key as keyof MeetingFormData)}
                      type="number"
                      min="0"
                      step="100"
                      className="pr-6"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">円</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 懇親会設定 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PartyPopper className="h-4 w-4 text-purple-500" />
              懇親会設定
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 懇親会あり/なしトグル */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={hasAfterParty}
                onClick={() => setValue('has_after_party', !hasAfterParty)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                  hasAfterParty ? 'bg-purple-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    hasAfterParty ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <Label className="cursor-pointer" onClick={() => setValue('has_after_party', !hasAfterParty)}>
                この例会に懇親会あり
              </Label>
            </div>

            {/* 懇親会詳細（懇親会ありの場合のみ表示） */}
            {hasAfterParty && (
              <div className="space-y-4 pl-4 border-l-2 border-purple-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-group">
                    <Label>懇親会場所</Label>
                    <Input
                      {...register('after_party_venue')}
                      placeholder="〇〇レストラン"
                      className="mt-1"
                    />
                  </div>
                  <div className="form-group">
                    <Label>懇親会開始時間</Label>
                    <Input
                      {...register('after_party_start_time')}
                      type="time"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">懇親会参加費（区分別）</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { key: 'after_party_fee_rac', label: 'RAC' },
                      { key: 'after_party_fee_rc', label: 'RC' },
                      { key: 'after_party_fee_obog', label: 'OB・OG' },
                      { key: 'after_party_fee_guest', label: 'ゲスト' },
                    ].map(({ key, label }) => (
                      <div key={key} className="form-group">
                        <Label>{label}</Label>
                        <div className="relative mt-1">
                          <Input
                            {...register(key as keyof MeetingFormData)}
                            type="number"
                            min="0"
                            step="100"
                            className="pr-6"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">円</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group max-w-xs">
                  <Label className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    懇親会定員（空欄=無制限）
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      {...register('after_party_capacity')}
                      type="number"
                      min="1"
                      placeholder="例: 20"
                      className="pr-6"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">名</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 例会内容 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">例会内容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="form-group">
              <Label>例会内容</Label>
              <Textarea
                {...register('description')}
                placeholder="例会の内容、目的、概要を記載してください"
                rows={4}
                className="mt-1"
              />
            </div>

            <div className="form-group">
              <Label>プログラム詳細</Label>
              <Textarea
                {...register('program_detail')}
                placeholder="タイムスケジュールや詳細なプログラムを記載してください"
                rows={4}
                className="mt-1"
              />
            </div>

            <div className="form-group">
              <Label>備考</Label>
              <Textarea
                {...register('note')}
                placeholder="備考・注意事項など"
                rows={2}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* MU登録URL（編集モードのみ・slug生成済みの場合） */}
        {mode === 'edit' && (meeting as any)?.mu_registration_slug && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                <Link2 className="h-4 w-4" />
                MU登録URL（外部参加者向け登録リンク）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="flex-1 text-sm bg-white px-3 py-2 rounded border border-blue-200 text-blue-800 break-all">
                  {existingMuUrl || (meeting as any)?.mu_registration_url}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copyMuUrl(existingMuUrl || (meeting as any)?.mu_registration_url || '')}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100 flex-shrink-0"
                >
                  <Copy className="h-4 w-4" />
                  コピー
                </Button>
                <a
                  href={existingMuUrl || (meeting as any)?.mu_registration_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-100 flex-shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                    開く
                  </Button>
                </a>
              </div>
              <p className="text-xs text-blue-600">
                ※ このURLを外部参加者（他クラブ・ゲスト等）に共有してください
              </p>
            </CardContent>
          </Card>
        )}

        {/* 送信ボタン */}
        <div className="flex justify-end gap-3">
          <Link href="/meetings">
            <Button type="button" variant="outline">
              キャンセル
            </Button>
          </Link>
          <Button type="submit" loading={loading}>
            <Save className="h-4 w-4" />
            {mode === 'create' ? '例会を作成' : '変更を保存'}
          </Button>
        </div>
      </form>
    </div>
  );
}
