'use client';

/**
 * 月のカレンダー
 * - 例会は青、地区行事は黄色の印で表示
 * - 自分の出欠を印の形で表す：塗り＝参加、グレー＝欠席、白抜き＝未回答（要回答）
 * - 日付を押すとその日を選択（予定の一覧は親が表示する）
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DAYS_JA, localYmd, needsAnswer, type ScheduleItem } from './types';

interface MonthCalendarProps {
  year: number;
  month: number; // 0-11
  items: ScheduleItem[];
  today: string;
  selected: string | null;
  onSelect: (ymd: string) => void;
  onPrev: () => void;
  onNext: () => void;
  loading?: boolean;
}

type Mark = 'meeting-yes' | 'meeting-no' | 'meeting-todo' | 'meeting' | 'district' | 'cancelled';

function markOf(item: ScheduleItem, today: string): Mark {
  if (item.kind === 'district_event') return 'district';
  if (item.status === 'cancelled') return 'cancelled';
  const t = item.myAttendance?.participationType;
  if (t === 'absent') return 'meeting-no';
  if (t) return 'meeting-yes';
  if (needsAnswer(item, today)) return 'meeting-todo';
  return 'meeting';
}

const MARK_CLASS: Record<Mark, string> = {
  'meeting-yes': 'bg-blue-600',
  'meeting-no': 'bg-gray-400',
  'meeting-todo': 'border-2 border-orange-500 bg-white',
  meeting: 'bg-blue-300',
  district: 'bg-amber-400',
  cancelled: 'bg-gray-300',
};

export default function MonthCalendar({
  year, month, items, today, selected, onSelect, onPrev, onNext, loading,
}: MonthCalendarProps) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = first.getDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => localYmd(new Date(year, month, i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = new Map<string, ScheduleItem[]>();
  for (const it of items) {
    const list = byDay.get(it.date) ?? [];
    list.push(it);
    byDay.set(it.date, list);
  }

  return (
    <div>
      {/* 月の切り替え */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          aria-label="前の月"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-base font-bold tabular-nums text-gray-900" aria-live="polite">
          {year}年{month + 1}月
        </p>
        <button
          type="button"
          onClick={onNext}
          aria-label="次の月"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* 曜日 */}
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-400">
        {DAYS_JA.map((d, i) => (
          <div key={d} className={cn('py-1', i === 0 && 'text-red-400', i === 6 && 'text-blue-400')}>{d}</div>
        ))}
      </div>

      {/* 日付 */}
      <div className={cn('grid grid-cols-7 gap-y-1', loading && 'opacity-50')} role="grid">
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={`e${i}`} />;
          const dayItems = byDay.get(ymd) ?? [];
          const dow = i % 7;
          const isToday = ymd === today;
          const isSelected = ymd === selected;
          const isPast = ymd < today;
          const label = `${Number(ymd.slice(8))}日${dayItems.length ? `、予定${dayItems.length}件` : ''}`;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelect(ymd)}
              aria-label={label}
              aria-pressed={isSelected}
              className={cn(
                'relative mx-auto flex h-12 w-full max-w-[3rem] flex-col items-center justify-start rounded-xl pt-1.5 transition-colors',
                isSelected ? 'bg-blue-600 text-white' : 'active:bg-gray-100',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-sm tabular-nums',
                  !isSelected && isToday && 'ring-2 ring-blue-600 font-bold text-blue-700',
                  !isSelected && !isToday && (dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-800'),
                  !isSelected && isPast && !isToday && 'opacity-50',
                  isSelected && 'font-bold',
                )}
              >
                {Number(ymd.slice(8))}
              </span>
              {dayItems.length > 0 && (
                <span className="mt-1 flex items-center gap-0.5">
                  {dayItems.slice(0, 3).map(it => {
                    const m = markOf(it, today);
                    return (
                      <span
                        key={`${it.kind}-${it.id}`}
                        className={cn(
                          'h-2 w-2 rounded-full',
                          isSelected && m !== 'meeting-todo' ? 'bg-white' : MARK_CLASS[m],
                          isSelected && m === 'meeting-todo' && 'border-2 border-white bg-transparent',
                        )}
                      />
                    );
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 凡例 */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" />参加</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full border-2 border-orange-500" />未回答</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-400" />欠席</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-300" />例会</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />地区行事</span>
      </div>
    </div>
  );
}
