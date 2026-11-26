'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Trash2, X } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import { WEEKDAYS, buildMonthCells, monthKey, weekday, weekdayTextClass } from '@/lib/calendar/month';
import { MEETING_STATUS_COLORS, MEETING_STATUS_LABELS, type MeetingStatus } from '@/types';

export type ScheduleMeeting = {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  status: string;
};

type Props = {
  year: number;
  month: number;
  today: string;
  fiscalLabel: string;
  prevMonth: string;
  nextMonth: string;
  meetings: ScheduleMeeting[];
  loadError?: boolean;
};

const STATUS_ORDER: MeetingStatus[] = ['draft', 'open', 'closed', 'finished', 'cancelled'];

const STATUS_DOT: Record<MeetingStatus, string> = {
  draft: 'bg-gray-400',
  open: 'bg-green-500',
  closed: 'bg-yellow-500',
  finished: 'bg-blue-500',
  cancelled: 'bg-red-500',
};

const asStatus = (s: string): MeetingStatus =>
  (STATUS_ORDER as string[]).includes(s) ? (s as MeetingStatus) : 'draft';

const newMeetingHref = (date: string) => `/meetings/new?date=${date}`;

/** anchorTop / anchorBottom: 押した例会の上端・下端。top は実際に出す位置（はみ出すときは上側） */
type Popover = { meeting: ScheduleMeeting; left: number; top: number; anchorTop: number; anchorBottom: number };

const POPOVER_WIDTH = 288; // w-72
const MARGIN = 8;

export default function ScheduleCalendar({
  year, month, today, fiscalLabel, prevMonth, nextMonth, meetings, loadError = false,
}: Props) {
  const router = useRouter();
  const [popover, setPopover] = useState<Popover | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // 削除中の例会ID（削除中は枠を閉じない・他の例会を開かない）
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // 枠を閉じたときにフォーカスを戻す先（押した例会のボタン）
  const anchorElRef = useRef<HTMLElement | null>(null);
  const deletingRef = useRef(false);

  const closePopover = useCallback(() => {
    if (deletingRef.current) return;
    setPopover(null);
    setConfirmingDelete(false);
    const anchor = anchorElRef.current;
    anchorElRef.current = null;
    if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
  }, []);

  // 枠の外のクリック・Esc・スクロールで閉じる
  const isOpen = popover !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      // 開いている例会のボタン自身は onClick 側で開閉を切り替える
      if (anchorElRef.current?.contains(target)) return;
      closePopover();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePopover(); };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', closePopover, { passive: true, capture: true });
    window.addEventListener('resize', closePopover);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', closePopover, { capture: true });
      window.removeEventListener('resize', closePopover);
    };
  }, [isOpen, closePopover]);

  // 描画前に高さを測り、下にはみ出す場合は例会の上側に出す（削除確認で高さが変わったときも測り直す）
  const anchorBottom = popover?.anchorBottom;
  const anchorTop = popover?.anchorTop;
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el || anchorBottom == null || anchorTop == null) return;
    const h = el.offsetHeight;
    const below = anchorBottom + 6;
    const top = below + h > window.innerHeight - MARGIN ? Math.max(MARGIN, anchorTop - h - 6) : below;
    setPopover((p) => (p && p.top !== top ? { ...p, top } : p));
  }, [anchorBottom, anchorTop, confirmingDelete, deletingId]);

  // 開いたら枠の最初のボタンにフォーカスを移す（キーボード・読み上げで操作できるように）
  const openMeetingId = popover?.meeting.id;
  useEffect(() => {
    if (!openMeetingId) return;
    popoverRef.current?.querySelector<HTMLElement>('a, button:not([aria-label="閉じる"])')?.focus({ preventScroll: true });
  }, [openMeetingId]);

  const openPopover = (e: React.MouseEvent<HTMLElement>, meeting: ScheduleMeeting) => {
    e.stopPropagation();
    if (deletingRef.current) return;
    // 同じ例会をもう一度押したら閉じる
    if (popover?.meeting.id === meeting.id) {
      closePopover();
      return;
    }
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    // 画面が狭いときも左端からはみ出さないようにする（最後に左の余白で下限をかける）
    const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - MARGIN));
    anchorElRef.current = el;
    setConfirmingDelete(false);
    setPopover({ meeting, left, top: r.bottom + 6, anchorTop: r.top, anchorBottom: r.bottom });
  };

  const handleDelete = async () => {
    if (!popover || deletingRef.current) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    const { id, title } = popover.meeting;
    deletingRef.current = true;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除に失敗しました');
      toast.success(`「${title}」を削除しました`);
      deletingRef.current = false;
      anchorElRef.current = null; // 削除した例会のボタンは消えるのでフォーカスは戻さない
      closePopover();
      router.refresh();
    } catch {
      toast.error(`「${title}」の削除に失敗しました`);
      setConfirmingDelete(false);
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  };

  const thisMonth = today.slice(0, 7);
  const currentKey = monthKey(year, month);
  const cells = buildMonthCells(year, month);
  const byDate = new Map<string, ScheduleMeeting[]>();
  meetings.forEach((it) => byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]));

  const navBtn = 'inline-flex h-9 items-center gap-1 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50';
  const dayNumClass = (date: string, wd: number) => cn(
    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
    date === today ? 'bg-indigo-600 font-bold text-white' : weekdayTextClass(wd),
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">年間スケジュール</h1>
          <p className="text-sm text-gray-500 mt-1">自クラブの例会を月ごとに確認できます（{fiscalLabel}）</p>
        </div>
        <Link
          href={newMeetingHref(currentKey === thisMonth ? today : `${currentKey}-01`)}
          className="inline-flex h-9 items-center gap-1 self-start rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 sm:self-auto"
        >
          <Plus className="h-4 w-4" />例会を追加
        </Link>
      </div>

      {/* 月の切り替え */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/schedule?month=${prevMonth}`} className={navBtn} aria-label="前の月">
          <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">前の月</span>
        </Link>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{year}年{month}月</p>
          {currentKey !== thisMonth && (
            <Link href="/schedule" className="text-xs text-indigo-700 hover:underline">今月に戻る</Link>
          )}
        </div>
        <Link href={`/schedule?month=${nextMonth}`} className={navBtn} aria-label="次の月">
          <span className="hidden sm:inline">次の月</span><ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* 凡例 */}
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-gray-600">
        {STATUS_ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[s])} />{MEETING_STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      {loadError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          例会を読み込めませんでした。ページを再読み込みしてください。
        </p>
      )}

      {/* 月表示（タブレット・PC） */}
      <div className="mb-6 hidden overflow-hidden rounded-xl border bg-white md:block">
        <div className="grid grid-cols-7 border-b bg-gray-50 text-center text-xs font-medium text-gray-500">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={cn('py-2', weekdayTextClass(i, ''))}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const wd = i % 7;
            if (!date) {
              return <div key={i} className={cn('min-h-[110px] border-b border-r bg-gray-50', wd === 6 && 'border-r-0')} />;
            }
            const list = byDate.get(date) ?? [];
            return (
              <div key={i} className={cn('group min-h-[110px] border-b border-r p-1.5', wd === 6 && 'border-r-0', date === today && 'bg-indigo-50/40')}>
                <div className="mb-1 flex items-center justify-between">
                  <p className={dayNumClass(date, wd)}>{Number(date.slice(8, 10))}</p>
                  <Link
                    href={newMeetingHref(date)}
                    title={`${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日に例会を追加`}
                    aria-label={`${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日に例会を追加`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-indigo-600 opacity-0 hover:bg-indigo-100 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="space-y-1">
                  {list.map((it) => {
                    const s = asStatus(it.status);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={(e) => openPopover(e, it)}
                        title={`${it.title}（${MEETING_STATUS_LABELS[s]}）`}
                        className={cn(
                          'block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-snug hover:opacity-80',
                          MEETING_STATUS_COLORS[s],
                          s === 'cancelled' && 'line-through',
                        )}
                      >
                        {it.startTime && <span className="font-semibold">{formatTime(it.startTime)} </span>}
                        {it.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 小さなカレンダー（スマホ）：印だけ。押すと下の一覧のその日へ */}
      <div className="mb-4 rounded-xl border bg-white p-2 md:hidden">
        <div className="grid grid-cols-7 text-center text-xs">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={cn('py-1 font-medium', weekdayTextClass(i, 'text-gray-500'))}>{w}</div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="h-11" />;
            const list = byDate.get(date) ?? [];
            const inner = (
              <>
                <span className={dayNumClass(date, i % 7)}>{Number(date.slice(8, 10))}</span>
                <span className="mt-0.5 flex h-1.5 gap-0.5">
                  {list.slice(0, 3).map((it) => (
                    <span key={it.id} className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[asStatus(it.status)])} />
                  ))}
                </span>
              </>
            );
            return list.length > 0 ? (
              <a key={i} href={`#day-${date}`} className="flex h-11 flex-col items-center pt-0.5" aria-label={`${Number(date.slice(8, 10))}日の例会（${list.length}件）`}>
                {inner}
              </a>
            ) : (
              <div key={i} className="flex h-11 flex-col items-center pt-0.5">{inner}</div>
            );
          })}
        </div>
      </div>

      {/* その月の例会一覧（スマホではこちらがメイン） */}
      <section className="rounded-xl border bg-white">
        <h2 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-gray-900">
          <CalendarDays className="h-4 w-4 text-indigo-600" />{month}月の例会{!loadError && `（${meetings.length}件）`}
        </h2>
        {loadError ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            <p>例会を読み込めませんでした</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            <p>この月の例会はありません</p>
            <p className="mt-1 text-xs">「例会を追加」またはカレンダーの「＋」から登録できます。</p>
          </div>
        ) : (
          <ul className="divide-y">
            {[...byDate.entries()].map(([date, list]) => {
              const wd = weekday(date);
              return (
                <li key={date} id={`day-${date}`} className={cn('flex scroll-mt-20 gap-3 px-4 py-3', date === today && 'bg-indigo-50/50')}>
                  <div className="w-10 shrink-0 text-center">
                    <p className={cn('text-xl font-bold', date === today ? 'text-indigo-700' : 'text-gray-800')}>{Number(date.slice(8, 10))}</p>
                    <p className={cn('text-xs', weekdayTextClass(wd, 'text-gray-500'))}>{WEEKDAYS[wd]}</p>
                    <Link
                      href={newMeetingHref(date)}
                      aria-label={`${Number(date.slice(8, 10))}日に例会を追加`}
                      className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <ul className="min-w-0 flex-1 space-y-2">
                    {list.map((it) => {
                      const s = asStatus(it.status);
                      return (
                        <li key={it.id}>
                          <button
                            type="button"
                            onClick={(e) => openPopover(e, it)}
                            className="group -m-1 block w-full rounded-md p-1 text-left hover:bg-gray-50"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', MEETING_STATUS_COLORS[s])}>
                                {MEETING_STATUS_LABELS[s]}
                              </span>
                              <span className={cn(
                                'break-words font-medium text-gray-900 group-hover:underline',
                                s === 'cancelled' && 'text-gray-400 line-through',
                              )}>
                                {it.title}
                              </span>
                            </div>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                              {it.startTime && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(it.startTime)}〜{it.endTime ? formatTime(it.endTime) : ''}
                                </span>
                              )}
                              {it.venueName && (
                                <span className="inline-flex items-center gap-1 break-words">
                                  <MapPin className="h-3 w-3 shrink-0" />{it.venueName}
                                </span>
                              )}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 例会の概要（詳細・編集・削除） */}
      {popover && (
        <MeetingPopover
          ref={popoverRef}
          popover={popover}
          confirmingDelete={confirmingDelete}
          deleting={deletingId === popover.meeting.id}
          onClose={closePopover}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

function MeetingPopover({
  ref, popover, confirmingDelete, deleting, onClose, onDelete,
}: {
  ref: React.Ref<HTMLDivElement>;
  popover: Popover;
  confirmingDelete: boolean;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { meeting: it, left, top } = popover;
  const s = asStatus(it.status);
  const [, mm, dd] = it.date.split('-').map(Number);
  const btn = 'inline-flex h-9 items-center justify-center rounded-md border text-sm hover:bg-gray-50';

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${it.title} の概要`}
      className="fixed z-50 w-72 max-w-[calc(100vw-16px)] rounded-xl border bg-white p-4 shadow-xl"
      style={{ left, top }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', MEETING_STATUS_COLORS[s])}>
          {MEETING_STATUS_LABELS[s]}
        </span>
        <button type="button" onClick={onClose} className="-mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100" aria-label="閉じる">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className={cn('break-words font-bold leading-snug text-gray-900', s === 'cancelled' && 'text-gray-400 line-through')}>
        {it.title}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-600">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        {mm}月{dd}日（{WEEKDAYS[weekday(it.date)]}）
        {it.startTime ? ` ${formatTime(it.startTime)}〜${it.endTime ? formatTime(it.endTime) : ''}` : ''}
      </p>
      <p className="mt-1 flex items-start gap-1.5 break-words text-sm text-gray-600">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{it.venueName || '会場未定'}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Link href={`/meetings/${it.id}`} className={btn}>詳細</Link>
        <Link href={`/meetings/${it.id}/edit`} className={btn}>編集</Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-1 rounded-md text-sm disabled:opacity-60',
            confirmingDelete
              ? 'bg-red-600 font-medium text-white hover:bg-red-700'
              : 'border border-red-200 text-red-600 hover:bg-red-50',
          )}
        >
          {deleting ? '削除中…' : confirmingDelete ? '本当に削除' : (<><Trash2 className="h-3.5 w-3.5" />削除</>)}
        </button>
      </div>
      {confirmingDelete && !deleting && (
        <p className="mt-2 text-center text-xs text-red-500">もう一度押すと削除します</p>
      )}
    </div>
  );
}
