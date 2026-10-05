import Link from 'next/link';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, MapPin } from 'lucide-react';
import { districtEvents, registrationForms } from '@/lib/db/schema';
import { requireDistrictPage, todayJst } from '@/lib/district/context';
import { sanitizeConfig } from '@/lib/event-registration/server';
import { cn, formatTime } from '@/lib/utils';

export const metadata = { title: '地区カレンダー' };

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

type CalendarItem = {
  key: string;
  date: string;
  kind: 'event' | 'deadline';
  title: string;
  sub: string;
  href: string;
};

const KIND_STYLE: Record<CalendarItem['kind'], { chip: string; label: string; dot: string }> = {
  event: { chip: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200', label: '行事', dot: 'bg-indigo-500' },
  deadline: { chip: 'bg-amber-100 text-amber-800 hover:bg-amber-200', label: '申込締切', dot: 'bg-amber-500' },
};

/** ?month=YYYY-MM を検証（不正なら今月） */
function parseMonth(v: string | string[] | undefined, today: string): { y: number; m: number } {
  if (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) {
    const y = Number(v.slice(0, 4));
    if (y >= 2000 && y <= 2100) return { y, m: Number(v.slice(5, 7)) };
  }
  return { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
}

const pad = (n: number) => String(n).padStart(2, '0');
const monthKey = (y: number, m: number) => `${y}-${pad(m)}`;
function shiftMonth(y: number, m: number, diff: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + diff;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}
function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export default async function DistrictCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { db, district } = await requireDistrictPage();
  const today = todayJst();
  const sp = await searchParams;
  const { y, m } = parseMonth(sp.month, today);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = `${monthKey(y, m)}-01`;
  const end = `${monthKey(y, m)}-${pad(daysInMonth)}`;
  const prev = shiftMonth(y, m, -1);
  const next = shiftMonth(y, m, 1);
  const thisMonth = today.slice(0, 7);

  if (!district) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">地区カレンダー</h1>
        <p className="mt-4 rounded-lg border bg-white p-8 text-center text-gray-500">
          地区が設定されていません。システム管理者にお問い合わせください。
        </p>
      </div>
    );
  }

  const items: CalendarItem[] = [];
  try {
    const [events, forms] = await Promise.all([
      db.select({
        id: districtEvents.id, title: districtEvents.title, date: districtEvents.date, eventType: districtEvents.eventType,
        startTime: districtEvents.startTime, venueName: districtEvents.venueName,
      })
        .from(districtEvents)
        .where(and(
          eq(districtEvents.districtId, district.id),
          isNull(districtEvents.deletedAt),
          gte(districtEvents.date, start),
          lte(districtEvents.date, end),
        ))
        .orderBy(asc(districtEvents.date), asc(districtEvents.startTime)),
      db.select({ id: registrationForms.id, config: registrationForms.config })
        .from(registrationForms)
        .where(and(eq(registrationForms.districtId, district.id), isNull(registrationForms.deletedAt))),
    ]);
    for (const e of events) {
      items.push({
        key: `e-${e.id}`,
        date: e.date.slice(0, 10),
        kind: 'event',
        title: e.title,
        sub: [e.eventType, e.startTime ? formatTime(e.startTime) : '', e.venueName ?? ''].filter(Boolean).join(' ・ '),
        href: '/district/events',
      });
    }
    for (const f of forms) {
      const c = sanitizeConfig(f.config);
      // 受付中・受付終了のフォームの締切だけを出す（下書きは出さない）
      if (c.status === 'draft' || !c.deadline) continue;
      const d = c.deadline.slice(0, 10);
      if (d < start || d > end) continue;
      items.push({
        key: `d-${f.id}`,
        date: d,
        kind: 'deadline',
        title: `${c.title || '申込フォーム'} 申込締切`,
        sub: c.status === 'open' ? '受付中' : '受付終了',
        href: `/district/registrations/${f.id}`,
      });
    }
  } catch (e) {
    console.error('district calendar error:', e);
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1));

  const byDate = new Map<string, CalendarItem[]>();
  items.forEach(it => byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]));

  // カレンダーのマス（前月末の空白 + 当月）
  const firstWd = weekday(start);
  const cells: Array<string | null> = [
    ...Array.from({ length: firstWd }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${monthKey(y, m)}-${pad(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const navBtn = 'inline-flex h-9 items-center gap-1 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50';

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">地区カレンダー</h1>
          <p className="text-sm text-gray-500 mt-1">地区行事と申込締切を月ごとに確認できます</p>
        </div>
        <Link href="/district/events" className="text-sm text-indigo-700 hover:underline">行事を登録・編集する →</Link>
      </div>

      {/* 月の切り替え */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/district/calendar?month=${monthKey(prev.y, prev.m)}`} className={navBtn} aria-label="前の月">
          <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">前の月</span>
        </Link>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{y}年{m}月</p>
          {monthKey(y, m) !== thisMonth && (
            <Link href="/district/calendar" className="text-xs text-indigo-700 hover:underline">今月に戻る</Link>
          )}
        </div>
        <Link href={`/district/calendar?month=${monthKey(next.y, next.m)}`} className={navBtn} aria-label="次の月">
          <span className="hidden sm:inline">次の月</span><ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* 凡例 */}
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-gray-600">
        {(Object.keys(KIND_STYLE) as CalendarItem['kind'][]).map(k => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', KIND_STYLE[k].dot)} />{KIND_STYLE[k].label}
          </span>
        ))}
      </div>

      {/* 月表示（タブレット・PC） */}
      <div className="mb-6 hidden overflow-hidden rounded-xl border bg-white md:block">
        <div className="grid grid-cols-7 border-b bg-gray-50 text-center text-xs font-medium text-gray-500">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={cn('py-2', i === 0 && 'text-red-500', i === 6 && 'text-blue-500')}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const list = date ? byDate.get(date) ?? [] : [];
            const wd = i % 7;
            return (
              <div key={i} className={cn('min-h-[96px] border-b border-r p-1.5', !date && 'bg-gray-50', wd === 6 && 'border-r-0')}>
                {date && (
                  <>
                    <p className={cn(
                      'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                      date === today ? 'bg-indigo-600 font-bold text-white' : wd === 0 ? 'text-red-500' : wd === 6 ? 'text-blue-500' : 'text-gray-700',
                    )}>
                      {Number(date.slice(8, 10))}
                    </p>
                    <div className="space-y-1">
                      {list.map(it => (
                        <Link key={it.key} href={it.href} title={it.title}
                          className={cn('block truncate rounded px-1.5 py-0.5 text-[11px] leading-snug', KIND_STYLE[it.kind].chip)}>
                          {it.title}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 予定一覧（スマホではこちらがメイン） */}
      <section className="rounded-xl border bg-white">
        <h2 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-gray-900">
          <CalendarDays className="h-4 w-4 text-indigo-600" />{m}月の予定（{items.length}件）
        </h2>
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            <p>この月の予定はありません</p>
            <p className="mt-1 text-xs">行事は「地区行事」から登録できます。</p>
          </div>
        ) : (
          <ul className="divide-y">
            {[...byDate.entries()].map(([date, list]) => {
              const wd = weekday(date);
              return (
                <li key={date} className={cn('flex gap-3 px-4 py-3', date === today && 'bg-indigo-50/50')}>
                  <div className="w-10 shrink-0 text-center">
                    <p className={cn('text-xl font-bold', date === today ? 'text-indigo-700' : 'text-gray-800')}>{Number(date.slice(8, 10))}</p>
                    <p className={cn('text-xs', wd === 0 ? 'text-red-500' : wd === 6 ? 'text-blue-500' : 'text-gray-500')}>{WEEKDAYS[wd]}</p>
                  </div>
                  <ul className="min-w-0 flex-1 space-y-2">
                    {list.map(it => (
                      <li key={it.key}>
                        <Link href={it.href} className="group block rounded-md p-1 -m-1 hover:bg-gray-50">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', KIND_STYLE[it.kind].chip)}>
                              {KIND_STYLE[it.kind].label}
                            </span>
                            <span className="break-words font-medium text-gray-900 group-hover:underline">{it.title}</span>
                          </div>
                          {it.sub && (
                            <p className="mt-0.5 flex items-start gap-1 break-words text-xs text-gray-500">
                              {it.kind === 'event' ? <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> : <ClipboardList className="mt-0.5 h-3 w-3 shrink-0" />}
                              {it.sub}
                            </p>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
