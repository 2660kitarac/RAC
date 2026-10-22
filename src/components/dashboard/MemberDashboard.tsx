'use client';

/**
 * 会員用トップページ（スマホでの利用が中心）
 *
 *  ┌ あいさつ ─────────────────┐
 *  │ 未回答のお知らせ（あれば）   │
 *  ├ 次の例会 ─────────────────┤
 *  │ 日付・時間・会場・出欠ボタン │
 *  │ ［例会の詳細を見る］         │
 *  ├ スケジュール ［カレンダー｜一覧］┤
 *  │ 月のカレンダー → 選んだ日の予定 │
 *  ├ 参加記録 ─────────────────┤
 *
 * 例会・地区行事を押すと、詳細（MeetingDetailSheet）が画面下から開く。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Building2, CalendarDays, ChevronDown, ChevronRight, ChevronUp, Clock, List, MapPin, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import AttendancePanel from './member/AttendancePanel';
import MonthCalendar from './member/MonthCalendar';
import MeetingDetailSheet from './member/MeetingDetailSheet';
import {
  PARTICIPATION_COLORS, PARTICIPATION_LABELS, PARTICIPATION_SHORT, DAYS_JA,
  checkDeadline, fiscalYearOf, formatMonthDay, hhmm, localYmd, needsAnswer, parseYmd,
  type MyMeeting, type ScheduleItem, type ScheduleResponse, type Stats,
} from './member/types';

// ─── 予定1件の行（カレンダーの日付一覧・一覧表示で共通） ─────────
function ItemRow({ item, today, onOpen }: { item: ScheduleItem; today: string; onOpen: () => void }) {
  const d = parseYmd(item.date);
  const dow = d.getDay();
  const isPast = item.date < today;
  const isDistrict = item.kind === 'district_event';
  const myType = item.kind === 'meeting' ? item.myAttendance?.participationType ?? null : null;
  const todo = item.kind === 'meeting' && needsAnswer(item, today);
  const cancelled = item.kind === 'meeting' && item.status === 'cancelled';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors active:bg-gray-50',
        isDistrict ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200 bg-white',
        isPast && 'opacity-60',
      )}
    >
      <div
        className={cn(
          'w-11 shrink-0 rounded-lg py-1 text-center',
          isDistrict ? 'bg-amber-100' : 'bg-blue-50',
        )}
      >
        <p className="text-[10px] leading-tight text-gray-500">{d.getMonth() + 1}月</p>
        <p className={cn('text-lg font-bold leading-tight tabular-nums', dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-900')}>
          {d.getDate()}
        </p>
        <p className="text-[10px] leading-tight text-gray-500">{DAYS_JA[dow]}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-gray-500">
          {isDistrict ? '地区行事' : '例会'}
          {cancelled && <span className="ml-1.5 text-red-600">中止</span>}
        </p>
        <p className={cn('truncate text-sm font-semibold', cancelled ? 'text-gray-400 line-through' : 'text-gray-900')}>
          {item.title}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-x-3 text-xs text-gray-500">
          {item.startTime && (
            <span className="flex shrink-0 items-center gap-1"><Clock className="h-3 w-3" />{hhmm(item.startTime)}</span>
          )}
          {item.venueName && (
            <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{item.venueName}</span></span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {myType && (
          <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', PARTICIPATION_COLORS[myType])}>
            {PARTICIPATION_SHORT[myType]}
          </span>
        )}
        {todo && (
          <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
            未回答
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-gray-300" />
      </div>
    </button>
  );
}

// ─── 次の例会 ───────────────────────────────────────────────
function NextMeeting({
  meeting, today, memberType, submitting, note, onNoteChange, onRegister, onOpen,
}: {
  meeting: MyMeeting;
  today: string;
  memberType: string;
  submitting: boolean;
  note: string;
  onNoteChange: (v: string) => void;
  onRegister: (type: string) => void;
  onOpen: () => void;
}) {
  const d = parseYmd(meeting.date);
  const days = Math.round((d.getTime() - parseYmd(today).getTime()) / 86400000);
  const myType = meeting.myAttendance?.participationType ?? null;

  return (
    <section aria-labelledby="next-meeting" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="flex gap-4 bg-blue-600 px-4 py-4 text-white">
        {/* 日付を大きく：一番知りたい情報 */}
        <div className="shrink-0 text-center">
          <p className="text-xs text-blue-100">{d.getMonth() + 1}月</p>
          <p className="text-4xl font-bold leading-none tabular-nums">{d.getDate()}</p>
          <p className="mt-1 text-xs text-blue-100">{DAYS_JA[d.getDay()]}曜日</p>
        </div>
        <div className="min-w-0 flex-1">
          <p id="next-meeting" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-blue-100">
            次の例会
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-white">
              {days === 0 ? '今日' : days === 1 ? '明日' : `あと${days}日`}
            </span>
          </p>
          <p className="mt-1 break-words text-lg font-bold leading-snug">{meeting.title}</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-blue-50">
            {meeting.startTime && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{hhmm(meeting.startTime)}〜</span>}
            {meeting.venueName && <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="break-words">{meeting.venueName}</span></span>}
          </p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {myType ? (
          <p className="text-sm text-gray-700">
            <span className={cn('mr-2 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', PARTICIPATION_COLORS[myType])}>
              {PARTICIPATION_LABELS[myType]}
            </span>
            で登録済みです。変更もここからできます。
          </p>
        ) : checkDeadline(meeting).allowed ? (
          <p className="text-sm font-semibold text-gray-900">出欠を登録してください</p>
        ) : null}
        <AttendancePanel
          meeting={meeting}
          memberType={memberType}
          submitting={submitting}
          note={note}
          onNoteChange={onNoteChange}
          onRegister={onRegister}
        />
        <button
          type="button"
          onClick={onOpen}
          className="flex h-11 w-full items-center justify-center gap-1 rounded-xl border border-gray-200 text-sm font-semibold text-blue-700 active:bg-blue-50"
        >
          例会の詳細・参加者を見る
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

// ─── 参加記録 ───────────────────────────────────────────────
function StatsCard({ stats }: { stats: Stats }) {
  const rate = stats.attendanceRate;
  const remaining = Math.max(stats.totalMeetings - stats.pastMeetings, 0);
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <TrendingUp className="h-4 w-4 text-green-600" />
        {stats.year}年度の参加記録
      </h2>
      <div className="mt-3 flex items-end gap-4">
        <p className="text-3xl font-bold tabular-nums text-gray-900">
          {rate !== null ? `${rate}%` : '—'}
        </p>
        <p className="pb-1 text-sm text-gray-500 tabular-nums">
          {stats.attendedCount} / {stats.pastMeetings}回 参加・残り{remaining}回
        </p>
      </div>
      {stats.pastMeetings > 0 && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={rate ?? 0} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={cn('h-full rounded-full', (rate ?? 0) >= 80 ? 'bg-green-500' : (rate ?? 0) >= 50 ? 'bg-yellow-400' : 'bg-red-400')}
            style={{ width: `${Math.min(rate ?? 0, 100)}%` }}
          />
        </div>
      )}
    </section>
  );
}

// ─── メイン ─────────────────────────────────────────────────
interface MemberDashboardProps {
  userName: string;
  clubName: string;
  memberType: string;
}

type View = 'calendar' | 'list';

export default function MemberDashboard({ userName, clubName, memberType: initialMemberType }: MemberDashboardProps) {
  const today = useMemo(() => localYmd(), []);
  const currentFy = fiscalYearOf(today);

  // 年度ごとのデータ（月を移動して別の年度に入ったら、その年度を読み込む）
  const [byYear, setByYear] = useState<Record<number, ScheduleResponse>>({});
  const [failedYears, setFailedYears] = useState<number[]>([]);
  const requested = useRef(new Set<number>());

  // 前回の表示方法を覚えておく（端末ごと。読めない環境ではカレンダー）
  // サーバーの描画と食い違わないよう、最初はカレンダーで描いてから保存値を読み込む
  const [view, setView] = useState<View>('calendar');
  useEffect(() => {
    try {
      // 端末に保存された値を反映するだけ（初回のみ）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem('member-dashboard-view') === 'list') setView('list');
    } catch { /* 読めない環境ではカレンダーのまま */ }
  }, []);
  const [cursor, setCursor] = useState(() => {
    const d = parseYmd(today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState<string>(today);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showPast, setShowPast] = useState(false);

  const changeView = (v: View) => {
    setView(v);
    try { localStorage.setItem('member-dashboard-view', v); } catch { /* 無視 */ }
  };

  const loadYear = useCallback(async (fy: number) => {
    if (requested.current.has(fy)) return;
    requested.current.add(fy);
    try {
      const res = await fetch(`/api/my/schedule?year=${fy}`);
      if (!res.ok) throw new Error();
      const data: ScheduleResponse = await res.json();
      setByYear(prev => ({ ...prev, [fy]: data }));
      setFailedYears(prev => prev.filter(y => y !== fy));
      setNotes(prev => {
        const next = { ...prev };
        for (const m of data.meetings || []) {
          if (m.myAttendance?.note && next[m.id] === undefined) next[m.id] = m.myAttendance.note;
        }
        return next;
      });
    } catch {
      requested.current.delete(fy);
      setFailedYears(prev => (prev.includes(fy) ? prev : [...prev, fy]));
      toast.error('予定を読み込めませんでした。通信状態を確認して、画面を開き直してください');
    }
  }, []);

  // 今年度と、表示中の月の年度を読み込む
  const cursorFy = cursor.month >= 6 ? cursor.year : cursor.year - 1;
  useEffect(() => {
    // サーバーからの読み込み（状態の更新は通信が終わってから行われる）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadYear(currentFy);
    void loadYear(cursorFy);
  }, [currentFy, cursorFy, loadYear]);

  const allMeetings = useMemo(
    () => Object.values(byYear).flatMap(d => d.meetings || []).sort((a, b) => a.date.localeCompare(b.date)),
    [byYear],
  );
  const allItems: ScheduleItem[] = useMemo(() => {
    const events = Object.values(byYear).flatMap(d => d.districtEvents || []);
    return [...allMeetings, ...events].sort((a, b) =>
      a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
  }, [byYear, allMeetings]);

  const current = byYear[currentFy];
  const memberType = current?.meta?.memberType || initialMemberType;
  const nextMeeting = allMeetings.find(m => m.date >= today && m.status === 'open') ?? null;
  const hasCurrent = !!current;
  const hasNextMeeting = !!nextMeeting;

  // 今年度の残りに予定がなければ、来年度も読み込んでおく（5〜6月に次の例会が出ないのを防ぐ）
  useEffect(() => {
    // サーバーからの読み込み（状態の更新は通信が終わってから行われる）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasCurrent && !hasNextMeeting) void loadYear(currentFy + 1);
  }, [hasCurrent, hasNextMeeting, currentFy, loadYear]);

  const todoMeetings = allMeetings.filter(m => needsAnswer(m, today));
  const openItem = openKey ? allItems.find(it => `${it.kind}-${it.id}` === openKey) ?? null : null;

  const handleRegister = useCallback((meetingId: string, participationType: string) => {
    const run = async (finalType: string): Promise<void> => {
      setSubmitting(meetingId);
      try {
        const res = await fetch('/api/my/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingId, participationType: finalType, note: notes[meetingId] || null }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 409 && data.canWaitlist && finalType !== 'waitlist') {
          setSubmitting(null);
          if (window.confirm('定員に達しています。キャンセル待ちとして登録しますか？')) await run('waitlist');
          return;
        }
        if (!res.ok) throw new Error(data.error || '出欠を登録できませんでした');

        setByYear(prev => {
          const next: Record<number, ScheduleResponse> = {};
          for (const [fy, d] of Object.entries(prev)) {
            next[Number(fy)] = {
              ...d,
              meetings: (d.meetings || []).map(m => m.id !== meetingId ? m : {
                ...m,
                myAttendance: {
                  id: data.id || m.myAttendance?.id || '',
                  participationType: finalType,
                  note: notes[meetingId] || null,
                  isLateRegistration: !!data.isLateRegistration,
                },
              }),
            };
          }
          return next;
        });

        const message = finalType === 'absent' ? '欠席で登録しました'
          : finalType === 'waitlist' ? 'キャンセル待ちで登録しました'
          : `「${PARTICIPATION_LABELS[finalType]}」で登録しました`;
        if (data.isLateRegistration) {
          toast.warning(`${message}（遅延登録）`, { description: '締切後の登録のため、運営が内容を確認します。', duration: 6000 });
        } else {
          toast.success(message);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '出欠を登録できませんでした');
      } finally {
        setSubmitting(null);
      }
    };
    void run(participationType);
  }, [notes]);

  const moveMonth = (delta: number) => {
    setCursor(c => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };
  const goToday = () => {
    const d = parseYmd(today);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(today);
  };
  const selectDay = (ymd: string) => setSelected(ymd);

  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
  const monthItems = allItems.filter(it => it.date.startsWith(monthPrefix));
  const selectedItems = allItems.filter(it => it.date === selected);
  const selectedInMonth = selected.startsWith(monthPrefix);

  const futureItems = allItems.filter(it => it.date >= today);
  const pastItems = allItems.filter(it => it.date < today && fiscalYearOf(it.date) === currentFy).reverse();

  if (!current && failedYears.includes(currentFy)) {
    return (
      <div className="rounded-2xl bg-white px-4 py-8 text-center ring-1 ring-gray-200">
        <p className="text-sm text-gray-600">予定を読み込めませんでした。</p>
        <button
          type="button"
          onClick={() => { void loadYear(currentFy); }}
          className="mt-3 inline-flex h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white"
        >
          もう一度読み込む
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1].map(i => (
          <div key={i} className="animate-pulse rounded-2xl bg-white p-4 ring-1 ring-gray-200">
            <div className="h-4 w-1/3 rounded bg-gray-200" />
            <div className="mt-3 h-28 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* あいさつ */}
      <header>
        <h1 className="break-words text-xl font-bold text-gray-900">こんにちは、{userName.split(/[\s　]/)[0]}さん</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-gray-500">
          <Building2 className="h-3.5 w-3.5" />
          {current?.meta?.clubName || clubName}
          {memberType && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{memberType === 'OB_OG' ? 'OB・OG' : memberType}</span>}
        </p>
      </header>

      {/* 未回答のお知らせ（次の例会以外にもあるとき） */}
      {todoMeetings.filter(m => m.id !== nextMeeting?.id).length > 0 && (
        <button
          type="button"
          onClick={() => {
            const m = todoMeetings.find(x => x.id !== nextMeeting?.id)!;
            setOpenKey(`meeting-${m.id}`);
          }}
          className="flex w-full items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left active:bg-orange-100"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-orange-600" />
          <span className="min-w-0 flex-1 text-sm text-orange-900">
            出欠が未回答の例会がほかに<span className="font-bold">{todoMeetings.filter(m => m.id !== nextMeeting?.id).length}件</span>あります
          </span>
          <ChevronRight className="h-4 w-4 text-orange-400" />
        </button>
      )}

      {/* 次の例会 */}
      {nextMeeting ? (
        <NextMeeting
          meeting={nextMeeting}
          today={today}
          memberType={memberType}
          submitting={submitting === nextMeeting.id}
          note={notes[nextMeeting.id] || ''}
          onNoteChange={v => setNotes(prev => ({ ...prev, [nextMeeting.id]: v }))}
          onRegister={type => handleRegister(nextMeeting.id, type)}
          onOpen={() => setOpenKey(`meeting-${nextMeeting.id}`)}
        />
      ) : (
        <section className="rounded-2xl bg-white px-4 py-8 text-center shadow-sm ring-1 ring-gray-200">
          <CalendarDays className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">いま募集中の例会はありません。予定が決まると、ここに表示されます。</p>
        </section>
      )}

      {/* スケジュール */}
      <section aria-labelledby="schedule-title" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="schedule-title" className="text-base font-bold text-gray-900">スケジュール</h2>
          <div className="flex rounded-lg bg-gray-100 p-0.5" role="group" aria-label="表示方法">
            {([['calendar', 'カレンダー', CalendarDays], ['list', '一覧', List]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => changeView(v)}
                className={cn(
                  'flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium',
                  view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {view === 'calendar' ? (
          <>
            <MonthCalendar
              year={cursor.year}
              month={cursor.month}
              items={monthItems}
              today={today}
              selected={selectedInMonth ? selected : null}
              onSelect={selectDay}
              onPrev={() => moveMonth(-1)}
              onNext={() => moveMonth(1)}
              loading={!byYear[cursorFy] && !failedYears.includes(cursorFy)}
            />
            {failedYears.includes(cursorFy) && (
              <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                この月の予定を読み込めませんでした。
                <button type="button" onClick={() => { void loadYear(cursorFy); }} className="font-semibold underline">
                  もう一度読み込む
                </button>
              </p>
            )}
            {!today.startsWith(monthPrefix) && (
              <button type="button" onClick={goToday} className="mt-1 inline-flex h-11 items-center text-sm font-medium text-blue-700">
                今月に戻る
              </button>
            )}

            {/* 選んだ日の予定。日を選んでいなければ、その月の予定をすべて出す */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                {selectedInMonth ? formatMonthDay(selected) : `${cursor.month + 1}月の予定`}
              </h3>
              {(selectedInMonth ? selectedItems : monthItems).length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">
                  {selectedInMonth
                    ? monthItems.length > 0 ? '予定はありません。印のある日を押すと、その日の予定が出ます。' : 'この月の予定はありません。'
                    : 'この月の予定はありません。'}
                </p>
              ) : (
                <div className="space-y-2">
                  {(selectedInMonth ? selectedItems : monthItems).map(it => (
                    <ItemRow key={`${it.kind}-${it.id}`} item={it} today={today} onOpen={() => setOpenKey(`${it.kind}-${it.id}`)} />
                  ))}
                </div>
              )}
              {selectedInMonth && selectedItems.length === 0 && monthItems.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-gray-500">{cursor.month + 1}月の予定</p>
                  {monthItems.map(it => (
                    <ItemRow key={`m-${it.kind}-${it.id}`} item={it} today={today} onOpen={() => setOpenKey(`${it.kind}-${it.id}`)} />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {futureItems.length === 0 && (
              <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">これからの予定はまだありません。</p>
            )}
            {futureItems.map(it => (
              <ItemRow key={`${it.kind}-${it.id}`} item={it} today={today} onOpen={() => setOpenKey(`${it.kind}-${it.id}`)} />
            ))}
            {pastItems.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowPast(v => !v)}
                  className="flex h-11 w-full items-center justify-center gap-1 text-sm text-gray-500"
                >
                  {showPast ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showPast ? '過去の予定を隠す' : `今年度の過去の予定（${pastItems.length}件）`}
                </button>
                {showPast && (
                  <div className="space-y-2">
                    {pastItems.map(it => (
                      <ItemRow key={`p-${it.kind}-${it.id}`} item={it} today={today} onOpen={() => setOpenKey(`${it.kind}-${it.id}`)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {current?.stats && <StatsCard stats={current.stats} />}

      <MeetingDetailSheet
        item={openItem}
        onClose={() => setOpenKey(null)}
        today={today}
        memberType={memberType}
        submitting={!!openItem && submitting === openItem.id}
        note={openItem ? notes[openItem.id] || '' : ''}
        onNoteChange={v => openItem && setNotes(prev => ({ ...prev, [openItem.id]: v }))}
        onRegister={(id, type) => handleRegister(id, type)}
      />
    </div>
  );
}
