'use client';

/**
 * クラブ管理側トップページの「スケジュール」（カレンダー／一覧）
 * - 自クラブの例会（下書きを含む）と地区行事を表示する
 * - 例会を押すと例会の管理画面（/meetings/[id]）へ。例会の管理画面を開けないロールと地区行事は詳細シートを開く
 * - データは会員トップページと同じ /api/my/schedule（年度ごと）を使う
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronDown, ChevronRight, ChevronUp, Clock, List, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { canAccessPage } from '@/lib/auth/page-access';
import { MEETING_STATUS_COLORS, MEETING_STATUS_LABELS, type MeetingStatus } from '@/types';
import MonthCalendar from '../member/MonthCalendar';
import MeetingDetailSheet from '../member/MeetingDetailSheet';
import {
  DAYS_JA, fiscalYearOf, formatMonthDay, hhmm, parseYmd,
  type ScheduleItem, type ScheduleResponse,
} from '../member/types';

type View = 'calendar' | 'list';
const VIEW_KEY = 'club-dashboard-view';

function ItemBody({ item, today }: { item: ScheduleItem; today: string }) {
  const d = parseYmd(item.date);
  const dow = d.getDay();
  const isDistrict = item.kind === 'district_event';
  const status = item.kind === 'meeting' ? (item.status as MeetingStatus) : null;
  const cancelled = status === 'cancelled';
  return (
    <>
      <div className={cn('w-11 shrink-0 rounded-lg py-1 text-center', isDistrict ? 'bg-amber-100' : 'bg-blue-50')}>
        <p className="text-[10px] leading-tight text-gray-500">{d.getMonth() + 1}月</p>
        <p className={cn('text-lg font-bold leading-tight tabular-nums', dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-900')}>
          {d.getDate()}
        </p>
        <p className="text-[10px] leading-tight text-gray-500">{DAYS_JA[dow]}</p>
      </div>
      <div className={cn('min-w-0 flex-1', item.date < today && 'opacity-70')}>
        <p className="text-[11px] font-semibold text-gray-500">{isDistrict ? '地区行事' : '例会'}</p>
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
        {status && MEETING_STATUS_LABELS[status] && (
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', MEETING_STATUS_COLORS[status])}>
            {MEETING_STATUS_LABELS[status]}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-gray-300" />
      </div>
    </>
  );
}

function ItemRow({
  item, today, canOpenMeetings, onOpen,
}: { item: ScheduleItem; today: string; canOpenMeetings: boolean; onOpen: () => void }) {
  const isDistrict = item.kind === 'district_event';
  const cls = cn(
    'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors active:bg-gray-50 hover:bg-gray-50',
    isDistrict ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200 bg-white',
  );
  if (!isDistrict && canOpenMeetings) {
    return (
      <Link href={`/meetings/${item.id}`} className={cls}>
        <ItemBody item={item} today={today} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={cls}>
      <ItemBody item={item} today={today} />
    </button>
  );
}

export default function ClubSchedule({
  role, today, hasClub = true,
}: { role: string | null | undefined; today: string; hasClub?: boolean }) {
  const canOpenMeetings = canAccessPage(role, '/meetings');
  const currentFy = fiscalYearOf(today);
  const [byYear, setByYear] = useState<Record<number, ScheduleResponse>>({});
  const [failedYears, setFailedYears] = useState<number[]>([]);
  const requested = useRef(new Set<number>());

  // 前回の表示方法（端末ごと）。サーバーの描画と食い違わないよう、最初はカレンダーで描いてから読み込む
  const [view, setView] = useState<View>('calendar');
  useEffect(() => {
    try {
      // 端末に保存された値を反映するだけ（初回のみ）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(VIEW_KEY) === 'list') setView('list');
    } catch { /* 読めない環境ではカレンダーのまま */ }
  }, []);
  const [cursor, setCursor] = useState(() => {
    const d = parseYmd(today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState<string>(today);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const changeView = (v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* 無視 */ }
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
    } catch {
      requested.current.delete(fy);
      setFailedYears(prev => (prev.includes(fy) ? prev : [...prev, fy]));
      toast.error('予定を読み込めませんでした。通信状態を確認して、画面を開き直してください');
    }
  }, []);

  const cursorFy = cursor.month >= 6 ? cursor.year : cursor.year - 1;
  useEffect(() => {
    // サーバーからの読み込み（状態の更新は通信が終わってから行われる）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadYear(currentFy);
    void loadYear(cursorFy);
  }, [currentFy, cursorFy, loadYear]);

  const allItems: ScheduleItem[] = useMemo(() => {
    const list = Object.values(byYear).flatMap(d => [...(d.meetings || []), ...(d.districtEvents || [])]);
    return list.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
  }, [byYear]);

  const openItem = openKey ? allItems.find(it => `${it.kind}-${it.id}` === openKey) ?? null : null;

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

  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
  const monthItems = allItems.filter(it => it.date.startsWith(monthPrefix));
  const selectedItems = allItems.filter(it => it.date === selected);
  const selectedInMonth = selected.startsWith(monthPrefix);
  const futureItems = allItems.filter(it => it.date >= today);
  const pastItems = allItems.filter(it => it.date < today && fiscalYearOf(it.date) === currentFy).reverse();

  const row = (it: ScheduleItem, prefix = '') => (
    <ItemRow
      key={`${prefix}${it.kind}-${it.id}`}
      item={it}
      today={today}
      canOpenMeetings={canOpenMeetings}
      onOpen={() => setOpenKey(`${it.kind}-${it.id}`)}
    />
  );

  if (!hasClub) {
    return (
      <section className="rounded-2xl bg-white px-4 py-8 text-center shadow-sm ring-1 ring-gray-200">
        <CalendarDays className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">
          このアカウントにはクラブが設定されていないため、スケジュールは表示されません。各クラブの例会は「例会」から確認できます。
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="club-schedule-title" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="club-schedule-title" className="text-base font-bold text-gray-900">スケジュール</h2>
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
            mode="club"
            year={cursor.year}
            month={cursor.month}
            items={monthItems}
            today={today}
            selected={selectedInMonth ? selected : null}
            onSelect={setSelected}
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

          <div className="mt-4 border-t border-gray-100 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              {selectedInMonth ? formatMonthDay(selected) : `${cursor.month + 1}月の予定`}
            </h3>
            {(selectedInMonth ? selectedItems : monthItems).length === 0 ? (
              <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">
                {selectedInMonth && monthItems.length > 0
                  ? '予定はありません。印のある日を押すと、その日の予定が出ます。'
                  : 'この月の予定はありません。'}
              </p>
            ) : (
              <div className="space-y-2">{(selectedInMonth ? selectedItems : monthItems).map(it => row(it))}</div>
            )}
            {selectedInMonth && selectedItems.length === 0 && monthItems.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-gray-500">{cursor.month + 1}月の予定</p>
                {monthItems.map(it => row(it, 'm-'))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {!byYear[currentFy] && !failedYears.includes(currentFy) && (
            <div className="h-20 animate-pulse rounded-xl bg-gray-100" aria-busy="true" />
          )}
          {byYear[currentFy] && futureItems.length === 0 && (
            <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">これからの予定はまだありません。</p>
          )}
          {futureItems.map(it => row(it))}
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
              {showPast && <div className="space-y-2">{pastItems.map(it => row(it, 'p-'))}</div>}
            </div>
          )}
        </div>
      )}

      {/* 地区行事（と、例会の管理画面を開けないロールの例会）の詳細 */}
      <MeetingDetailSheet
        item={openItem}
        onClose={() => setOpenKey(null)}
        today={today}
        memberType={byYear[currentFy]?.meta?.memberType || 'RAC'}
        submitting={false}
        note=""
        onNoteChange={() => {}}
        onRegister={() => {}}
        readOnly
      />
    </section>
  );
}
