'use client';

/**
 * 出欠登録ボタン（例会のみ／＋懇親会／欠席）とメモ欄
 * スマホで押しやすいよう、ボタンは横いっぱいのグリッドに並べる。
 */
import { useState } from 'react';
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, Loader2, PartyPopper, XCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatCurrency } from '@/lib/utils';
import { checkDeadline, feesFor, type MyMeeting } from './types';

interface AttendancePanelProps {
  meeting: MyMeeting;
  memberType: string;
  submitting: boolean;
  note: string;
  onNoteChange: (val: string) => void;
  onRegister: (type: string) => void;
}

export default function AttendancePanel({
  meeting, memberType, submitting, note, onNoteChange, onRegister,
}: AttendancePanelProps) {
  const [noteOpen, setNoteOpen] = useState(!!note);
  const myType = meeting.myAttendance?.participationType ?? null;
  const deadline = checkDeadline(meeting);
  const fees = feesFor(meeting, memberType);

  if (!deadline.allowed) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <span>{deadline.message || '現在は出欠を登録できません'}</span>
      </div>
    );
  }

  const options = [
    {
      type: 'meeting_only',
      label: '例会のみ',
      fee: fees.meeting,
      icon: CheckCircle,
      active: 'border-blue-600 bg-blue-600 text-white',
      idle: 'border-gray-200 bg-white text-gray-800 active:bg-blue-50',
    },
    ...(meeting.hasAfterParty
      ? [{
          type: 'meeting_and_party',
          label: '＋懇親会',
          fee: meeting.afterPartyFeeType === 'actual_cost' ? null : fees.meeting + fees.party,
          icon: PartyPopper,
          active: 'border-purple-600 bg-purple-600 text-white',
          idle: 'border-gray-200 bg-white text-gray-800 active:bg-purple-50',
        }]
      : []),
    {
      type: 'absent',
      label: '欠席',
      fee: null,
      icon: XCircle,
      active: 'border-gray-700 bg-gray-700 text-white',
      idle: 'border-gray-200 bg-white text-gray-600 active:bg-gray-100',
    },
  ];

  return (
    <div className="space-y-2.5">
      {deadline.deadlinePassed && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            登録締切（{meeting.registrationDeadline}）を過ぎています。遅延登録として受け付けます。
            {deadline.policy === 'meal_strict' && ' 食事の手配はできません。'}
          </span>
        </div>
      )}

      <div className={cn('grid gap-2', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map(o => {
          const isActive = myType === o.type;
          const Icon = o.icon;
          return (
            <button
              key={o.type}
              type="button"
              onClick={() => onRegister(o.type)}
              disabled={submitting}
              aria-pressed={isActive}
              className={cn(
                'flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-2 text-sm font-semibold transition-colors disabled:opacity-60',
                isActive ? o.active : o.idle,
              )}
            >
              <span className="flex items-center gap-1">
                {submitting && isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                {o.label}
              </span>
              {o.fee !== null && o.fee > 0 && (
                <span className={cn('text-[11px] font-normal tabular-nums', isActive ? 'text-white/85' : 'text-gray-500')}>
                  {formatCurrency(o.fee)}
                </span>
              )}
              {o.type === 'meeting_and_party' && o.fee === null && (
                <span className={cn('text-[11px] font-normal', isActive ? 'text-white/85' : 'text-gray-500')}>実費</span>
              )}
            </button>
          );
        })}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setNoteOpen(v => !v)}
          className="flex items-center gap-1 py-1 text-xs text-gray-500"
        >
          遅刻・早退などのメモ
          {noteOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {noteOpen && (
          <>
            <Textarea
              value={note}
              onChange={e => onNoteChange(e.target.value)}
              placeholder="例：19時頃に遅れて参加します"
              rows={2}
              className="mt-1 text-base sm:text-sm"
            />
            <p className="mt-1 text-[11px] text-gray-400">メモは出欠ボタンを押したときに一緒に送られます</p>
          </>
        )}
      </div>
    </div>
  );
}
