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
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
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
    },
  });

  const onSubmit = async (data: MeetingFormData) => {
    setLoading(true);
    
    try {
      const slug = meeting?.mu_registration_slug || generateSlug();
      const baseUrl = window.location.origin;
      const registrationUrl = `${baseUrl}/mu/${slug}`;

      const meetingData = {
        club_id: clubId,
        title: data.title,
        meeting_number: data.meeting_number ? parseInt(data.meeting_number) : null,
        theme: data.theme || null,
        date: data.date,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        venue_name: data.venue_name || null,
        venue_address: data.venue_address || null,
        committee: data.committee || null,
        manager_user_id: data.manager_user_id || null,
        description: data.description || null,
        program_detail: data.program_detail || null,
        registration_deadline: data.registration_deadline || null,
        fee_rac: parseInt(data.fee_rac) || 0,
        fee_rc: parseInt(data.fee_rc) || 0,
        fee_obog: parseInt(data.fee_obog) || 0,
        fee_guest: parseInt(data.fee_guest) || 0,
        meal_fee: parseInt(data.meal_fee) || 0,
        mu_registration_slug: slug,
        mu_registration_url: registrationUrl,
        status: data.status,
        note: data.note || null,
      };

      if (mode === 'create') {
        const res = await fetch('/api/meetings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clubId: meetingData.club_id, title: meetingData.title,
            meetingNumber: meetingData.meeting_number, theme: meetingData.theme,
            date: meetingData.date, startTime: meetingData.start_time,
            endTime: meetingData.end_time, venueName: meetingData.venue_name,
            venueAddress: meetingData.venue_address, committee: meetingData.committee,
            managerUserId: meetingData.manager_user_id, description: meetingData.description,
            programDetail: meetingData.program_detail,
            registrationDeadline: meetingData.registration_deadline,
            feeRac: meetingData.fee_rac, feeRc: meetingData.fee_rc,
            feeObog: meetingData.fee_obog, feeGuest: meetingData.fee_guest,
            mealFee: meetingData.meal_fee, muRegistrationSlug: slug,
            muRegistrationUrl: registrationUrl, status: meetingData.status,
            note: meetingData.note,
          }),
        });
        const newData = await res.json();
        if (!res.ok) throw new Error(newData.error);
        toast.success('例会を作成しました', { description: `MU登録URL: ${registrationUrl}` });
        router.push(`/meetings/${newData.id}`);
      } else if (meeting) {
        const res = await fetch(`/api/meetings/${meeting.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: meetingData.title, meetingNumber: meetingData.meeting_number,
            theme: meetingData.theme, date: meetingData.date,
            startTime: meetingData.start_time, endTime: meetingData.end_time,
            venueName: meetingData.venue_name, venueAddress: meetingData.venue_address,
            committee: meetingData.committee, managerUserId: meetingData.manager_user_id,
            description: meetingData.description, programDetail: meetingData.program_detail,
            registrationDeadline: meetingData.registration_deadline,
            feeRac: meetingData.fee_rac, feeRc: meetingData.fee_rc,
            feeObog: meetingData.fee_obog, feeGuest: meetingData.fee_guest,
            mealFee: meetingData.meal_fee, status: meetingData.status, note: meetingData.note,
          }),
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
          </CardContent>
        </Card>

        {/* 登録料設定 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">登録料設定</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { key: 'fee_rac', label: 'RAC登録料' },
                { key: 'fee_rc', label: 'RC登録料' },
                { key: 'fee_obog', label: 'OB・OG登録料' },
                { key: 'fee_guest', label: 'ゲスト登録料' },
                { key: 'meal_fee', label: 'お弁当代' },
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

        {/* 内容・プログラム */}
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
