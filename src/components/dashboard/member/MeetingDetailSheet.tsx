'use client';

/**
 * 例会・地区行事の詳細（スマホでは画面下から出るシート）
 * 日時・会場（地図）・テーマ・内容・プログラム・参加費・締切・懇親会・出欠登録・参加者・MU共有URL
 */
import { useState } from 'react';
import {
  CalendarDays, Check, Clock, Copy, ExternalLink, MapPin, PartyPopper, Share2, Star, Users, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MeetingParticipantsDialog } from '@/components/dashboard/MeetingParticipantsDialog';
import { muRegistrationUrl } from '@/lib/app-url';
import { cn, formatCurrency } from '@/lib/utils';
import AttendancePanel from './AttendancePanel';
import {
  PARTICIPATION_COLORS, PARTICIPATION_LABELS, feesFor, formatMonthDay, hhmm,
  type DistrictEvent, type MyMeeting, type ScheduleItem,
} from './types';

interface MeetingDetailSheetProps {
  item: ScheduleItem | null;
  onClose: () => void;
  today: string;
  memberType: string;
  submitting: boolean;
  note: string;
  onNoteChange: (val: string) => void;
  onRegister: (meetingId: string, type: string) => void;
}

function mapUrl(name?: string | null, address?: string | null) {
  const q = [name, address].filter(Boolean).join(' ');
  return q ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}` : null;
}

function timeRange(start?: string | null, end?: string | null) {
  if (!start) return '時間未定';
  return end ? `${hhmm(start)}〜${hhmm(end)}` : `${hhmm(start)}〜`;
}

/** 見出し＋本文の1ブロック */
function Section({ icon: Icon, title, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-medium text-gray-500">{title}</h3>
        <div className="mt-0.5 text-sm text-gray-900">{children}</div>
      </div>
    </section>
  );
}

function Venue({ name, address }: { name?: string | null; address?: string | null }) {
  const url = mapUrl(name, address);
  if (!name && !address) return null;
  return (
    <Section icon={MapPin} title="会場">
      <p className="break-words font-medium">{name}</p>
      {address && <p className="mt-0.5 break-words text-xs text-gray-500">{address}</p>}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-blue-700 active:bg-blue-50"
        >
          <ExternalLink className="h-4 w-4" />
          地図で開く
        </a>
      )}
    </Section>
  );
}

function ShareBlock({ meeting }: { meeting: MyMeeting }) {
  const [copied, setCopied] = useState(false);
  const url = muRegistrationUrl(meeting.muRegistrationSlug, meeting.muRegistrationUrl);
  if (!url) return null;

  const share = async () => {
    // スマホでは共有メニュー（LINE など）を開く。使えない端末ではコピーする
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: meeting.title, text: `${meeting.title}（${formatMonthDay(meeting.date)}）の申込はこちら`, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('URLをコピーしました');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('コピーできませんでした。URLを長押ししてコピーしてください');
    }
  };

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
        <Share2 className="h-4 w-4" />
        友達・家族を誘う
      </p>
      <p className="mt-0.5 text-xs text-blue-800">このURLから、ログインせずに申し込めます</p>
      <p className="mt-2 select-all break-all rounded-lg bg-white px-3 py-2 text-xs text-gray-600">{url}</p>
      <button
        type="button"
        onClick={share}
        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-sm font-semibold text-white active:bg-blue-700"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'コピーしました' : 'URLを送る'}
      </button>
    </div>
  );
}

function MeetingBody(props: Omit<MeetingDetailSheetProps, 'item' | 'onClose'> & { meeting: MyMeeting }) {
  const { meeting, today, memberType, submitting, note, onNoteChange, onRegister } = props;
  const fees = feesFor(meeting, memberType);
  const myType = meeting.myAttendance?.participationType ?? null;
  const isPast = meeting.date < today;
  const isCancelled = meeting.status === 'cancelled';

  return (
    <div className="space-y-5">
      {/* 自分の出欠 */}
      {myType && (
        <div className="space-y-2">
          <p className={cn('inline-flex rounded-full border px-3 py-1 text-xs font-semibold', PARTICIPATION_COLORS[myType])}>
            {PARTICIPATION_LABELS[myType]}で登録済み
          </p>
          {meeting.myAttendance?.note && (
            <p className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              メモ：{meeting.myAttendance.note}
            </p>
          )}
        </div>
      )}

      {!isPast && !isCancelled && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">出欠を登録</h3>
          <AttendancePanel
            meeting={meeting}
            memberType={memberType}
            submitting={submitting}
            note={note}
            onNoteChange={onNoteChange}
            onRegister={type => onRegister(meeting.id, type)}
          />
        </div>
      )}

      <div className="space-y-4 border-t border-gray-100 pt-4">
        <Section icon={Clock} title="日時">
          {formatMonthDay(meeting.date)} {timeRange(meeting.startTime, meeting.endTime)}
        </Section>
        <Venue name={meeting.venueName} address={meeting.venueAddress} />
        {meeting.theme && (
          <Section icon={Star} title="テーマ"><p className="break-words">{meeting.theme}</p></Section>
        )}
        {meeting.committee && (
          <Section icon={Users} title="担当委員会"><p className="break-words">{meeting.committee}</p></Section>
        )}
        <Section icon={Wallet} title="参加費（自クラブ会員）">
          <p className="tabular-nums">
            例会 {fees.meeting > 0 ? formatCurrency(fees.meeting) : '無料'}
            {meeting.mealFee > 0 && <span className="text-gray-500">（お弁当 +{formatCurrency(meeting.mealFee)}）</span>}
          </p>
          {meeting.hasAfterParty && (
            <p className="tabular-nums">
              懇親会 {meeting.afterPartyFeeType === 'actual_cost' ? '実費' : fees.party > 0 ? formatCurrency(fees.party) : '無料'}
            </p>
          )}
        </Section>
        {meeting.registrationDeadline && (
          <Section icon={CalendarDays} title="登録締切">{formatMonthDay(meeting.registrationDeadline)}</Section>
        )}
        {meeting.hasAfterParty && (
          <Section icon={PartyPopper} title="懇親会">
            <p className="break-words">
              {meeting.afterPartyVenue || '場所未定'}
              {meeting.afterPartyStartTime && ` ${hhmm(meeting.afterPartyStartTime)}〜`}
            </p>
          </Section>
        )}
      </div>

      {(meeting.description || meeting.programDetail) && (
        <div className="space-y-4 border-t border-gray-100 pt-4">
          {meeting.description && (
            <div>
              <h3 className="text-xs font-medium text-gray-500">内容</h3>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-900">{meeting.description}</p>
            </div>
          )}
          {meeting.programDetail && (
            <div>
              <h3 className="text-xs font-medium text-gray-500">プログラム</h3>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-900">{meeting.programDetail}</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 border-t border-gray-100 pt-4">
        <MeetingParticipantsDialog meetingId={meeting.id} meetingTitle={meeting.title} meetingDate={meeting.date} />
        {!isPast && !isCancelled && <ShareBlock meeting={meeting} />}
      </div>
    </div>
  );
}

function DistrictBody({ event }: { event: DistrictEvent }) {
  return (
    <div className="space-y-4">
      <Section icon={Clock} title="日時">
        {formatMonthDay(event.date)} {timeRange(event.startTime, event.endTime)}
      </Section>
      <Venue name={event.venueName} address={event.venueAddress} />
      {!!event.registrationFee && event.registrationFee > 0 && (
        <Section icon={Wallet} title="登録料"><p className="tabular-nums">{formatCurrency(event.registrationFee)}</p></Section>
      )}
      {event.registrationDeadline && (
        <Section icon={CalendarDays} title="登録締切">{formatMonthDay(event.registrationDeadline)}</Section>
      )}
      {event.description && (
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-xs font-medium text-gray-500">内容</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-900">{event.description}</p>
        </div>
      )}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
        地区行事への申込は、クラブの担当者または地区からの案内に沿って行ってください。
      </p>
    </div>
  );
}

export default function MeetingDetailSheet(props: MeetingDetailSheetProps) {
  const { item, onClose } = props;
  const isDistrict = item?.kind === 'district_event';

  return (
    <Dialog open={!!item} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="gap-0 sm:max-w-lg">
        {item && (
          <>
            <DialogHeader className="mb-4 pr-10 text-left">
              <p className={cn('text-xs font-semibold', isDistrict ? 'text-amber-700' : 'text-blue-700')}>
                {isDistrict ? `地区行事${(item as DistrictEvent).eventType ? `（${(item as DistrictEvent).eventType}）` : ''}` : '例会'}
                {/* 回数はタイトルに含まれていないときだけ出す */}
                {!isDistrict && (item as MyMeeting).meetingNumber && !item.title.includes(`第${(item as MyMeeting).meetingNumber}回`)
                  ? `　第${(item as MyMeeting).meetingNumber}回` : ''}
                {!isDistrict && (item as MyMeeting).status === 'cancelled' && <span className="ml-2 text-red-600">中止</span>}
              </p>
              <DialogTitle className="text-left text-lg leading-snug break-words">{item.title}</DialogTitle>
              <DialogDescription className="text-left">{formatMonthDay(item.date)}</DialogDescription>
            </DialogHeader>
            {item.kind === 'meeting'
              ? <MeetingBody {...props} meeting={item} />
              : <DistrictBody event={item} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
