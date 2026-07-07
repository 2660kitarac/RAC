'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, MapPin, Clock, ExternalLink, Copy, Check,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Hourglass,
  PartyPopper, AlertCircle, TrendingUp, Star, Share2,
  Users, Building2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatDate, formatCurrency } from '@/lib/utils';

// ─── 型定義 ──────────────────────────────────────────────
interface MyMeeting {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  venueAddress: string | null;
  status: string;
  registrationDeadline: string | null;
  muRegistrationUrl: string | null;
  muRegistrationSlug: string | null;
  feeRac: number;
  feeRc: number;
  feeObog: number;
  feeGuest: number;
  hasAfterParty: boolean;
  afterPartyVenue: string | null;
  afterPartyStartTime: string | null;
  afterPartyFeeRac: number;
  afterPartyFeeRc: number;
  afterPartyFeeObog: number;
  afterPartyFeeGuest: number;
  capacity: number | null;
  kind: 'meeting';
  myAttendance: {
    id: string;
    participationType: string | null;
    note: string | null;
  } | null;
}

interface DistrictEvent {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  venueName: string | null;
  eventType: string;
  isAwardTarget: boolean;
  kind: 'district_event';
}

interface Stats {
  year: number;
  totalMeetings: number;
  pastMeetings: number;
  attendedCount: number;
  attendanceRate: number | null;
}

interface Meta {
  clubName: string;
  memberType: string;
  fiscalYear: number;
}

type ScheduleItem = (MyMeeting & { kind: 'meeting' }) | (DistrictEvent & { kind: 'district_event' });

const PARTICIPATION_LABELS: Record<string, string> = {
  meeting_only: '例会のみ参加',
  meeting_and_party: '例会＋懇親会',
  absent: '欠席',
  waitlist: 'キャンセル待ち',
};

const PARTICIPATION_COLORS: Record<string, string> = {
  meeting_only: 'bg-blue-100 text-blue-700 border-blue-200',
  meeting_and_party: 'bg-purple-100 text-purple-700 border-purple-200',
  absent: 'bg-red-100 text-red-600 border-red-200',
  waitlist: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function getDayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `（${DAYS_JA[d.getDay()]}）`;
}

function isDeadlinePassed(deadline: string | null) {
  if (!deadline) return false;
  return new Date().toISOString().split('T')[0] > deadline;
}

// ─── MU URL コピーボタン ─────────────────────────────────
function MuShareButton({ url, slug }: { url: string | null; slug: string | null }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = url || (slug ? `https://mu.rotary.org/${slug}` : null);

  if (!shareUrl) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('URLをコピーしました！友達に送ってください 🎉');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('コピーに失敗しました');
    }
  };

  return (
    <div className="mt-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Share2 className="h-4 w-4 text-blue-600 shrink-0" />
        <p className="text-sm font-medium text-blue-800">友達・家族を誘う</p>
      </div>
      <p className="text-xs text-blue-600 mb-2">このURLを送ると、MUから直接申込できます</p>
      <div className="flex gap-2">
        <div className="flex-1 min-w-0 bg-white rounded-lg px-3 py-2 border border-blue-200">
          <p className="text-xs text-gray-600 truncate font-mono">{shareUrl}</p>
        </div>
        <Button
          size="sm"
          variant={copied ? 'default' : 'outline'}
          className={`shrink-0 gap-1.5 text-xs transition-all ${copied ? 'bg-green-500 hover:bg-green-600 border-green-500' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}`}
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'コピー済み' : 'URLをコピー'}
        </Button>
      </div>
    </div>
  );
}

// ─── 参加ボタン群 ─────────────────────────────────────────
function AttendanceButtons({
  meeting,
  memberType,
  submitting,
  noteInputs,
  noteOpen,
  onRegister,
  onNoteChange,
  onNoteToggle,
}: {
  meeting: MyMeeting;
  memberType: string;
  submitting: string | null;
  noteInputs: Record<string, string>;
  noteOpen: Record<string, boolean>;
  onRegister: (meetingId: string, type: string, isWaitlist?: boolean) => void;
  onNoteChange: (meetingId: string, val: string) => void;
  onNoteToggle: (meetingId: string) => void;
}) {
  const myType = meeting.myAttendance?.participationType ?? null;
  const deadlinePassed = isDeadlinePassed(meeting.registrationDeadline);
  const isFull = meeting.capacity !== null && meeting.capacity <= 0; // countは別途

  const getFee = (type: 'meeting' | 'party') => {
    if (type === 'meeting') {
      if (memberType === 'RAC') return meeting.feeRac;
      if (memberType === 'RC') return meeting.feeRc;
      if (memberType === 'OB_OG') return meeting.feeObog;
      return meeting.feeGuest;
    } else {
      if (memberType === 'RAC') return meeting.afterPartyFeeRac;
      if (memberType === 'RC') return meeting.afterPartyFeeRc;
      if (memberType === 'OB_OG') return meeting.afterPartyFeeObog;
      return meeting.afterPartyFeeGuest;
    }
  };

  const meetingFee = getFee('meeting');
  const partyFee = getFee('party');
  const isSubmitting = submitting === meeting.id;

  return (
    <div className="space-y-2">
      {deadlinePassed && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          登録締切（{meeting.registrationDeadline}）が過ぎています
        </div>
      )}

      {!deadlinePassed && (
        <>
          <div className="flex flex-wrap gap-2">
            {/* 例会のみ参加 */}
            <button
              onClick={() => onRegister(meeting.id, 'meeting_only')}
              disabled={isSubmitting}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all disabled:opacity-50 ${
                myType === 'meeting_only'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <CheckCircle className="h-4 w-4" />
              例会のみ
              {meetingFee > 0 && <span className="text-xs opacity-60">{formatCurrency(meetingFee)}</span>}
            </button>

            {/* 例会＋懇親会 */}
            {meeting.hasAfterParty && (
              <button
                onClick={() => onRegister(meeting.id, 'meeting_and_party')}
                disabled={isSubmitting}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all disabled:opacity-50 ${
                  myType === 'meeting_and_party'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-purple-300 hover:bg-purple-50'
                }`}
              >
                <PartyPopper className="h-4 w-4" />
                ＋懇親会
                {(meetingFee + partyFee) > 0 && (
                  <span className="text-xs opacity-60">{formatCurrency(meetingFee + partyFee)}</span>
                )}
              </button>
            )}

            {/* 欠席 */}
            <button
              onClick={() => onRegister(meeting.id, 'absent')}
              disabled={isSubmitting}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all disabled:opacity-50 ${
                myType === 'absent'
                  ? 'border-red-400 bg-red-50 text-red-600 shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-red-300 hover:bg-red-50'
              }`}
            >
              <XCircle className="h-4 w-4" />
              欠席
            </button>
          </div>

          {/* 懇親会情報 */}
          {meeting.hasAfterParty && (
            <p className="text-xs text-purple-600 flex items-center gap-1 pl-1">
              <PartyPopper className="h-3 w-3" />
              懇親会：{meeting.afterPartyVenue || '場所未定'}
              {meeting.afterPartyStartTime && ` ${meeting.afterPartyStartTime.substring(0, 5)}〜`}
            </p>
          )}

          {/* メモ */}
          <div>
            <button
              type="button"
              onClick={() => onNoteToggle(meeting.id)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
            >
              メモを追加（遅刻・早退など）
              {noteOpen[meeting.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {(noteOpen[meeting.id] || noteInputs[meeting.id]) && (
              <Textarea
                value={noteInputs[meeting.id] || ''}
                onChange={e => onNoteChange(meeting.id, e.target.value)}
                placeholder="例：19時頃に遅れて参加します"
                rows={2}
                className="mt-1.5 text-sm"
              />
            )}
          </div>
        </>
      )}

      {/* 登録済みメモ */}
      {myType && meeting.myAttendance?.note && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <span>💬</span>
          <span>{meeting.myAttendance.note}</span>
        </div>
      )}
    </div>
  );
}

// ─── 次の例会カード ───────────────────────────────────────
function NextMeetingCard({
  meeting,
  memberType,
  submitting,
  noteInputs,
  noteOpen,
  onRegister,
  onNoteChange,
  onNoteToggle,
}: {
  meeting: MyMeeting;
  memberType: string;
  submitting: string | null;
  noteInputs: Record<string, string>;
  noteOpen: Record<string, boolean>;
  onRegister: (meetingId: string, type: string, isWaitlist?: boolean) => void;
  onNoteChange: (meetingId: string, val: string) => void;
  onNoteToggle: (meetingId: string) => void;
}) {
  const myType = meeting.myAttendance?.participationType ?? null;
  const dateObj = new Date(meeting.date + 'T00:00:00');
  const daysUntil = Math.ceil((dateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const mapQuery = encodeURIComponent(
    [meeting.venueName, meeting.venueAddress].filter(Boolean).join(' ')
  );

  return (
    <Card className="overflow-hidden border-0 shadow-md">
      {/* ヘッダー帯 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 opacity-90" />
            <span className="font-semibold text-base">次の例会</span>
          </div>
          <div className="flex items-center gap-2">
            {myType && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${PARTICIPATION_COLORS[myType]} bg-white/90`}>
                {myType === 'meeting_only' && <CheckCircle className="h-3 w-3 inline mr-1" />}
                {myType === 'meeting_and_party' && <PartyPopper className="h-3 w-3 inline mr-1" />}
                {myType === 'absent' && <XCircle className="h-3 w-3 inline mr-1" />}
                {myType === 'waitlist' && <Hourglass className="h-3 w-3 inline mr-1" />}
                {PARTICIPATION_LABELS[myType]}
              </span>
            )}
            {daysUntil >= 0 && daysUntil <= 14 && (
              <span className="text-xs bg-white/20 rounded-full px-2.5 py-1 font-medium">
                {daysUntil === 0 ? '今日！' : daysUntil === 1 ? '明日' : `あと${daysUntil}日`}
              </span>
            )}
          </div>
        </div>
        <p className="mt-2 text-xl font-bold leading-tight">{meeting.title}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-blue-100">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(meeting.date)}{getDayLabel(meeting.date)}
            {meeting.startTime && ` ${meeting.startTime.substring(0, 5)}`}
            {meeting.endTime && `〜${meeting.endTime.substring(0, 5)}`}
          </span>
          {meeting.venueName && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {meeting.venueName}
            </span>
          )}
        </div>
      </div>

      <CardContent className="p-4 space-y-4">
        {/* 場所・地図 */}
        {(meeting.venueName || meeting.venueAddress) && (
          <div className="flex items-start justify-between gap-3 bg-gray-50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">{meeting.venueName}</p>
              {meeting.venueAddress && (
                <p className="text-xs text-gray-500 mt-0.5">{meeting.venueAddress}</p>
              )}
            </div>
            <a
              href={`https://maps.google.com/maps?q=${mapQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium bg-white border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              地図
            </a>
          </div>
        )}

        {/* 出欠ボタン */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">出欠を登録</p>
          <AttendanceButtons
            meeting={meeting}
            memberType={memberType}
            submitting={submitting}
            noteInputs={noteInputs}
            noteOpen={noteOpen}
            onRegister={onRegister}
            onNoteChange={onNoteChange}
            onNoteToggle={onNoteToggle}
          />
        </div>

        {/* MU URL共有 */}
        <MuShareButton url={meeting.muRegistrationUrl} slug={meeting.muRegistrationSlug} />
      </CardContent>
    </Card>
  );
}

// ─── 参加率ウィジェット ───────────────────────────────────
function AttendanceStatsCard({ stats }: { stats: Stats }) {
  const rate = stats.attendanceRate ?? 0;
  const color = rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : 'text-red-500';
  const barColor = rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-400' : 'bg-red-400';
  const emoji = rate >= 80 ? '🌟' : rate >= 50 ? '👍' : '💪';

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-green-600" />
          {stats.year}年度 参加記録
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-gray-500">参加率</p>
            <p className={`text-3xl font-bold ${color}`}>
              {stats.attendanceRate !== null ? `${stats.attendanceRate}%` : '—'}
              <span className="text-lg ml-1">{stats.attendanceRate !== null ? emoji : ''}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">参加回数</p>
            <p className="text-xl font-bold text-gray-800">
              {stats.attendedCount}
              <span className="text-sm font-normal text-gray-500"> / {stats.pastMeetings}回</span>
            </p>
          </div>
        </div>

        {/* プログレスバー */}
        {stats.pastMeetings > 0 && (
          <div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${Math.min(rate, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <p className="text-xs text-gray-400">0%</p>
              <p className="text-xs text-gray-400">100%</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-blue-600">年度例会数</p>
            <p className="font-bold text-blue-800">{stats.totalMeetings}回</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-gray-500">残り例会数</p>
            <p className="font-bold text-gray-700">{stats.totalMeetings - stats.pastMeetings}回</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 年間スケジュール ─────────────────────────────────────
function YearlyScheduleCard({
  meetings,
  districtEvents,
  memberType,
  submitting,
  noteInputs,
  noteOpen,
  onRegister,
  onNoteChange,
  onNoteToggle,
}: {
  meetings: MyMeeting[];
  districtEvents: DistrictEvent[];
  memberType: string;
  submitting: string | null;
  noteInputs: Record<string, string>;
  noteOpen: Record<string, boolean>;
  onRegister: (meetingId: string, type: string) => void;
  onNoteChange: (meetingId: string, val: string) => void;
  onNoteToggle: (meetingId: string) => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [showPast, setShowPast] = useState(false);

  // 全イベントをマージして日付順ソート
  const allItems: ScheduleItem[] = [
    ...meetings.map(m => ({ ...m, kind: 'meeting' as const })),
    ...districtEvents.map(e => ({ ...e, kind: 'district_event' as const })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const futureItems = allItems.filter(item => item.date >= today);
  const pastItems = allItems.filter(item => item.date < today).reverse(); // 新しい順

  const renderItem = (item: ScheduleItem) => {
    const isPast = item.date < today;
    const dateObj = new Date(item.date + 'T00:00:00');
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const dayOfWeek = DAYS_JA[dateObj.getDay()];
    const isSun = dateObj.getDay() === 0;
    const isSat = dateObj.getDay() === 6;

    if (item.kind === 'district_event') {
      return (
        <div
          key={`de-${item.id}`}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-all ${
            isPast ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className={`shrink-0 text-center w-12 rounded-lg py-1.5 ${isPast ? 'bg-gray-100' : 'bg-amber-100'}`}>
            <p className="text-xs text-gray-500">{month}月</p>
            <p className={`text-lg font-bold leading-tight ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-800'}`}>
              {day}
            </p>
            <p className={`text-xs ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-gray-400'}`}>{dayOfWeek}</p>
          </div>
          <div className="flex-1 min-w-0 py-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                地区行事
              </span>
              {item.isAwardTarget && (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Star className="h-2.5 w-2.5" />表彰
                </span>
              )}
              <span className="text-xs text-gray-500">{item.eventType}</span>
            </div>
            <p className="font-semibold text-gray-900 text-sm mt-0.5 truncate">{item.title}</p>
            {item.venueName && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />{item.venueName}
              </p>
            )}
          </div>
        </div>
      );
    }

    // meeting
    const myType = item.myAttendance?.participationType ?? null;
    const isOpen = item.status === 'open';
    const deadlinePassed = isDeadlinePassed(item.registrationDeadline);
    const [expanded, setExpanded] = useState(false);

    return (
      <div
        key={`m-${item.id}`}
        className={`rounded-xl border transition-all ${
          isPast
            ? 'bg-gray-50 border-gray-100'
            : isOpen
            ? 'bg-white border-blue-200 shadow-sm'
            : 'bg-white border-gray-200'
        }`}
      >
        <div
          className="flex items-start gap-3 px-4 py-3 cursor-pointer"
          onClick={() => !isPast && setExpanded(e => !e)}
        >
          {/* 日付バッジ */}
          <div className={`shrink-0 text-center w-12 rounded-lg py-1.5 ${
            isPast ? 'bg-gray-100' : isOpen ? 'bg-blue-100' : 'bg-gray-100'
          }`}>
            <p className="text-xs text-gray-500">{month}月</p>
            <p className={`text-lg font-bold leading-tight ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-800'}`}>
              {day}
            </p>
            <p className={`text-xs ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-gray-400'}`}>{dayOfWeek}</p>
          </div>

          <div className="flex-1 min-w-0 py-0.5">
            <div className="flex items-start justify-between gap-2">
              <p className={`font-semibold text-sm truncate ${isPast ? 'text-gray-500' : 'text-gray-900'}`}>
                {item.title}
              </p>
              {/* 出欠バッジ */}
              {myType && (
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${PARTICIPATION_COLORS[myType]}`}>
                  {myType === 'meeting_only' && '✓ 参加'}
                  {myType === 'meeting_and_party' && '✓ ＋懇'}
                  {myType === 'absent' && '✗ 欠席'}
                  {myType === 'waitlist' && '⌛ 待機'}
                </span>
              )}
              {!myType && isOpen && !isPast && !deadlinePassed && (
                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border border-orange-200 bg-orange-50 text-orange-600 font-medium">
                  未回答
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
              {item.startTime && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />{item.startTime.substring(0, 5)}
                </span>
              )}
              {item.venueName && (
                <span className="text-xs text-gray-400 flex items-center gap-1 truncate max-w-[180px]">
                  <MapPin className="h-3 w-3 shrink-0" />{item.venueName}
                </span>
              )}
            </div>
          </div>

          {!isPast && isOpen && (
            <div className="shrink-0 text-gray-300">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          )}
        </div>

        {/* 展開：出欠登録 + MU URL */}
        {!isPast && expanded && (
          <div className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-100">
            {isOpen && (
              <div className="pt-3">
                <AttendanceButtons
                  meeting={item}
                  memberType={memberType}
                  submitting={submitting}
                  noteInputs={noteInputs}
                  noteOpen={noteOpen}
                  onRegister={onRegister}
                  onNoteChange={onNoteChange}
                  onNoteToggle={onNoteToggle}
                />
              </div>
            )}
            <MuShareButton url={item.muRegistrationUrl} slug={item.muRegistrationSlug} />
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-600" />
          年間スケジュール
          <Badge variant="secondary" className="ml-auto text-xs">{allItems.length}件</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {futureItems.length === 0 && pastItems.length === 0 && (
          <p className="text-sm text-gray-400 py-8 text-center">予定が登録されていません</p>
        )}

        {futureItems.map(renderItem)}

        {/* 過去の例会（折りたたみ） */}
        {pastItems.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setShowPast(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors"
            >
              {showPast ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showPast ? '過去の例会を隠す' : `過去の例会 ${pastItems.length}件を表示`}
            </button>
            {showPast && (
              <div className="space-y-2 mt-2">
                {pastItems.map(renderItem)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── メインコンポーネント ──────────────────────────────────
interface MemberDashboardProps {
  userName: string;
  clubName: string;
  memberType: string;
}

export default function MemberDashboard({ userName, clubName, memberType: initialMemberType }: MemberDashboardProps) {
  const [meetings, setMeetings] = useState<MyMeeting[]>([]);
  const [districtEvents, setDistrictEvents] = useState<DistrictEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});

  // データ取得
  useEffect(() => {
    Promise.all([
      fetch('/api/my/schedule').then(r => r.json()),
      fetch('/api/my/attendance').then(r => r.json()),
    ])
      .then(([scheduleData, attendanceData]) => {
        // スケジュールAPIの出席情報を正とする
        setMeetings(scheduleData.meetings || []);
        setDistrictEvents(scheduleData.districtEvents || []);
        setStats(scheduleData.stats || null);
        setMeta(scheduleData.meta || null);

        // メモ初期化
        const notes: Record<string, string> = {};
        for (const m of (scheduleData.meetings || [])) {
          if (m.myAttendance?.note) notes[m.id] = m.myAttendance.note;
        }
        setNoteInputs(notes);
      })
      .catch(() => toast.error('データの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, []);

  const handleRegister = useCallback(async (meetingId: string, participationType: string, isWaitlist = false) => {
    const finalType = isWaitlist ? 'waitlist' : participationType;
    setSubmitting(meetingId);
    try {
      const res = await fetch('/api/my/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          participationType: finalType,
          note: noteInputs[meetingId] || null,
        }),
      });
      const data = await res.json();

      if (res.status === 409 && data.canWaitlist) {
        if (confirm('定員に達しています。キャンセル待ちとして登録しますか？')) {
          await handleRegister(meetingId, participationType, true);
        }
        return;
      }
      if (!res.ok) throw new Error(data.error || '登録に失敗しました');

      // UI楽観的更新
      setMeetings(prev => prev.map(m => {
        if (m.id !== meetingId) return m;
        return {
          ...m,
          myAttendance: {
            id: data.id || '',
            participationType: finalType,
            note: noteInputs[meetingId] || null,
          },
        };
      }));

      toast.success(
        finalType === 'absent' ? '欠席を登録しました' :
        finalType === 'waitlist' ? 'キャンセル待ちで登録しました' :
        `「${PARTICIPATION_LABELS[finalType]}」で登録しました 🎉`
      );
    } catch (err: any) {
      toast.error(err.message || '登録に失敗しました');
    } finally {
      setSubmitting(null);
    }
  }, [noteInputs]);

  const memberType = meta?.memberType || initialMemberType;
  const today = new Date().toISOString().split('T')[0];

  // 直近のopen例会を「次の例会」として使用
  const nextMeeting = meetings.find(m => m.date >= today && m.status === 'open') ?? null;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i} className="border-0 shadow-md">
            <CardContent className="p-6">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-24 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* グリーティング */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            こんにちは、{userName.split(' ')[0]}さん 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {meta?.clubName || clubName}
            {memberType && (
              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium ml-1">
                {memberType}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 次の例会カード（メインCTA） */}
      {nextMeeting ? (
        <NextMeetingCard
          meeting={nextMeeting}
          memberType={memberType}
          submitting={submitting}
          noteInputs={noteInputs}
          noteOpen={noteOpen}
          onRegister={handleRegister}
          onNoteChange={(id, val) => setNoteInputs(prev => ({ ...prev, [id]: val }))}
          onNoteToggle={id => setNoteOpen(prev => ({ ...prev, [id]: !prev[id] }))}
        />
      ) : (
        <Card className="border-0 shadow-md">
          <CardContent className="py-10 text-center text-gray-400">
            <Calendar className="h-10 w-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">現在募集中の例会はありません</p>
          </CardContent>
        </Card>
      )}

      {/* 参加率 + 年間スケジュール（2カラム on md+） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 参加率（左 1/3） */}
        {stats && (
          <div className="md:col-span-1">
            <AttendanceStatsCard stats={stats} />
          </div>
        )}

        {/* 年間スケジュール（右 2/3） */}
        <div className={stats ? 'md:col-span-2' : 'md:col-span-3'}>
          <YearlyScheduleCard
            meetings={meetings}
            districtEvents={districtEvents}
            memberType={memberType}
            submitting={submitting}
            noteInputs={noteInputs}
            noteOpen={noteOpen}
            onRegister={handleRegister}
            onNoteChange={(id, val) => setNoteInputs(prev => ({ ...prev, [id]: val }))}
            onNoteToggle={id => setNoteOpen(prev => ({ ...prev, [id]: !prev[id] }))}
          />
        </div>
      </div>
    </div>
  );
}
