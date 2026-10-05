'use client';

import { useState } from 'react';
import Link from 'next/link';

import { formatDate, formatTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { UserRole } from '@/types';
import { isDistrictStaff } from '@/lib/auth/tenant';
import { Calendar, ClipboardList, FilePlus2, MapPin, Plus, Pencil } from 'lucide-react';

/** 行事に紐づく申込フォーム */
export interface LinkedForm {
  id: string;
  title: string;
  status: 'draft' | 'open' | 'closed';
  deadline: string | null;
  /** 申込件数（取消を除く） */
  registrations: number;
}

const FORM_STATUS: Record<LinkedForm['status'], { label: string; className: string }> = {
  open: { label: '受付中', className: 'bg-green-100 text-green-700' },
  draft: { label: '下書き', className: 'bg-gray-100 text-gray-600' },
  closed: { label: '受付終了', className: 'bg-amber-100 text-amber-800' },
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 'YYYY-MM-DD' を時差の影響なく分解する */
function ymd(date: string): { m: number; d: number; w: string } {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const w = WEEKDAYS[new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()];
  return { m, d, w };
}

interface DistrictEvent {
  id: string;
  district_id: string;
  host_club_id: string | null;
  title: string;
  event_type: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  registration_fee: number;
  registration_deadline: string | null;
  description: string | null;
  is_award_target: boolean;
  is_joint_meeting: boolean;
  created_at: string;
}

interface DistrictEventsListProps {
  events: DistrictEvent[];
  clubs: { id: string; name: string }[];
  districtId: string;
  userRole: UserRole;
  /** 行事ID → 紐づく申込フォーム */
  linkedForms?: Record<string, LinkedForm[]>;
}

/** 主催クラブ「なし（地区主催）」を表す値（Select は空文字を値にできないため） */
const NO_HOST = '__district__';

const EVENT_TYPES = [
  '地区大会', '地区協議会', 'ゾーン会議', '合同例会', 'サービスプロジェクト',
  '研修会', '表彰式', '交流会', 'その他'
];

export default function DistrictEventsList({ events: initialEvents, clubs, districtId, userRole, linkedForms = {} }: DistrictEventsListProps) {
  // 行事の登録・編集は地区役員なら誰でもできる（API 側も地区スタッフを許可）
  const canManage = isDistrictStaff(userRole);

  const [events, setEvents] = useState<DistrictEvent[]>(initialEvents);
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<DistrictEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterYear, setFilterYear] = useState('all');

  const [form, setForm] = useState({
    title: '', event_type: 'その他', date: '', start_time: '', end_time: '',
    venue_name: '', venue_address: '', registration_fee: '0',
    registration_deadline: '', description: '',
    host_club_id: '', is_award_target: false, is_joint_meeting: false,
  });

  const years = [...new Set(events.map(e => e.date.substring(0, 4)))].sort((a, b) => b.localeCompare(a));

  const filtered = events.filter(e =>
    filterYear === 'all' || e.date.startsWith(filterYear)
  );

  const openCreate = () => {
    setEditTarget(null);
    setForm({ title: '', event_type: 'その他', date: '', start_time: '', end_time: '', venue_name: '', venue_address: '', registration_fee: '0', registration_deadline: '', description: '', host_club_id: '', is_award_target: false, is_joint_meeting: false });
    setShowDialog(true);
  };

  const openEdit = (e: DistrictEvent) => {
    setEditTarget(e);
    setForm({
      title: e.title, event_type: e.event_type,
      date: e.date, start_time: e.start_time ?? '', end_time: e.end_time ?? '',
      venue_name: e.venue_name ?? '', venue_address: e.venue_address ?? '',
      registration_fee: String(e.registration_fee ?? 0),
      registration_deadline: e.registration_deadline ?? '',
      description: e.description ?? '',
      host_club_id: e.host_club_id ?? '',
      is_award_target: e.is_award_target,
      is_joint_meeting: e.is_joint_meeting,
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error('行事名を入力してください'); return; }
    if (!form.date) { toast.error('開催日を入力してください'); return; }
    setLoading(true);
    try {
      const payload = {
        districtId,
        title: form.title.trim(),
        eventType: form.event_type,
        date: form.date,
        startTime: form.start_time || null,
        endTime: form.end_time || null,
        venueName: form.venue_name || null,
        venueAddress: form.venue_address || null,
        registrationFee: Number(form.registration_fee) || 0,
        registrationDeadline: form.registration_deadline || null,
        description: form.description || null,
        hostClubId: form.host_club_id && form.host_club_id !== NO_HOST ? form.host_club_id : null,
        isAwardTarget: form.is_award_target,
        isJointMeeting: form.is_joint_meeting,
      };

      if (editTarget) {
        const response = await fetch(`/api/district/${editTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '更新に失敗しました');
        setEvents(prev => prev.map(e => e.id === editTarget.id ? {
          ...e,
          title: payload.title,
          event_type: payload.eventType,
          date: payload.date,
          start_time: payload.startTime,
          end_time: payload.endTime,
          venue_name: payload.venueName,
          venue_address: payload.venueAddress,
          registration_fee: payload.registrationFee,
          registration_deadline: payload.registrationDeadline,
          description: payload.description,
          host_club_id: payload.hostClubId,
          is_award_target: payload.isAwardTarget,
          is_joint_meeting: payload.isJointMeeting,
        } : e));
        toast.success('行事情報を更新しました');
      } else {
        const response = await fetch('/api/district', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '登録に失敗しました');
        // レスポンスにidが含まれる場合はリストに追加
        if (data.id) {
          setEvents(prev => [{
            id: data.id,
            district_id: districtId,
            host_club_id: payload.hostClubId,
            title: payload.title,
            event_type: payload.eventType,
            date: payload.date,
            start_time: payload.startTime,
            end_time: payload.endTime,
            venue_name: payload.venueName,
            venue_address: payload.venueAddress,
            registration_fee: payload.registrationFee,
            registration_deadline: payload.registrationDeadline,
            description: payload.description,
            is_award_target: payload.isAwardTarget,
            is_joint_meeting: payload.isJointMeeting,
            created_at: '',
          }, ...prev]);
        }
        toast.success('行事を登録しました');
      }
      setShowDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              地区行事一覧（{filtered.length}件）
            </CardTitle>
            <div className="flex gap-2">
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="年度" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  {years.map(y => <SelectItem key={y} value={y}>{y}年</SelectItem>)}
                </SelectContent>
              </Select>
              {canManage && (
                <Button size="sm" onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="h-4 w-4 mr-1" />行事登録
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="font-medium text-gray-600">行事がありません</p>
              {canManage && <p className="mt-1 text-sm">「行事登録」から地区大会・研修会などを登録できます。</p>}
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map(event => {
                const { m, d, w } = ymd(event.date);
                const forms = linkedForms[event.id] ?? [];
                return (
                  <li key={event.id} className="rounded-lg border p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      {/* 日付 */}
                      <div className="w-12 shrink-0 rounded-lg bg-indigo-50 py-1.5 text-center">
                        <p className="text-[11px] text-indigo-600">{m}月</p>
                        <p className="text-lg font-bold leading-tight text-indigo-700">{d}</p>
                        <p className="text-[11px] text-indigo-600">（{w}）</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 break-words font-medium text-gray-900">{event.title}</p>
                          {canManage && (
                            <Button size="icon-sm" variant="ghost" onClick={() => openEdit(event)} aria-label="行事を編集" className="shrink-0">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{event.event_type}</span>
                          {event.is_award_target && (
                            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">表彰対象</span>
                          )}
                          {event.is_joint_meeting && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">合同例会</span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          {formatDate(event.date)}
                          {event.start_time && ` ${formatTime(event.start_time)}`}
                          {event.end_time && `〜${formatTime(event.end_time)}`}
                        </p>
                        {event.venue_name && (
                          <p className="mt-0.5 flex items-start gap-1 break-words text-xs text-gray-500">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />{event.venue_name}
                          </p>
                        )}

                        {/* 申込フォームとの連携 */}
                        <div className="mt-3 border-t pt-3">
                          {forms.length > 0 ? (
                            <ul className="space-y-2">
                              {forms.map(f => (
                                <li key={f.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
                                    <ClipboardList className="h-4 w-4 shrink-0 text-indigo-600" />
                                    <span className="text-gray-700">申込フォーム</span>
                                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${FORM_STATUS[f.status].className}`}>
                                      {FORM_STATUS[f.status].label}
                                    </span>
                                    <span className="text-gray-600">申込 {f.registrations}件</span>
                                    {f.deadline && <span className="text-xs text-gray-500">締切 {formatDate(f.deadline)}</span>}
                                  </div>
                                  <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                                    <Link href={`/district/registrations/${f.id}`}>申込状況を見る</Link>
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          ) : canManage ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-xs text-gray-500">この行事の申込フォームはまだありません</p>
                              <Button asChild size="sm" variant="outline" className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50 sm:w-auto">
                                <Link href={`/district/registrations/new?eventId=${encodeURIComponent(event.id)}`}>
                                  <FilePlus2 className="h-3.5 w-3.5" />申込フォームを作る
                                </Link>
                              </Button>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">申込フォームはありません</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 行事登録・編集ダイアログ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? '行事を編集' : '地区行事の登録'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label required>行事名</Label>
              <Input placeholder="第○回地区大会" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label required>行事種別</Label>
                <Select value={form.event_type} onValueChange={v => setForm(f => ({ ...f, event_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label required>開催日</Label>
                <Input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>開始時刻</Label>
                <Input type="time" value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>終了時刻</Label>
                <Input type="time" value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>会場名</Label>
              <Input placeholder="○○ホール" value={form.venue_name}
                onChange={e => setForm(f => ({ ...f, venue_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>会場住所</Label>
              <Input placeholder="○○市○○町1-2-3" value={form.venue_address}
                onChange={e => setForm(f => ({ ...f, venue_address: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>参加費（円）</Label>
                <Input type="number" min={0} value={form.registration_fee}
                  onChange={e => setForm(f => ({ ...f, registration_fee: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>申込締切</Label>
                <Input type="date" value={form.registration_deadline}
                  onChange={e => setForm(f => ({ ...f, registration_deadline: e.target.value }))} />
              </div>
            </div>
            {clubs.length > 0 && (
              <div className="space-y-1.5">
                <Label>主催クラブ</Label>
                <Select value={form.host_club_id || NO_HOST} onValueChange={v => setForm(f => ({ ...f, host_club_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_HOST}>— 地区主催 —</SelectItem>
                    {clubs.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_award_target}
                  onChange={e => setForm(f => ({ ...f, is_award_target: e.target.checked }))}
                  className="h-4 w-4 rounded" />
                <span className="text-sm">表彰対象行事</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_joint_meeting}
                  onChange={e => setForm(f => ({ ...f, is_joint_meeting: e.target.checked }))}
                  className="h-4 w-4 rounded" />
                <span className="text-sm">合同例会</span>
              </label>
            </div>
            <div className="space-y-1.5">
              <Label>概要・説明</Label>
              <Textarea value={form.description} rows={3}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSubmit} loading={loading}>
              {editTarget ? '更新する' : '登録する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
