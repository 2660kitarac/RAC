'use client';

/**
 * 地区のクラブ一覧（地区役員用）
 * クラブ名で絞り込み、各数値で並べ替えできる。スマホではカード表示になる。
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { ClubWithStats } from '@/lib/district/stats';
import { formatYmd } from '../dashboard/format';

type SortKey = 'name' | 'members' | 'meetings' | 'lastMeeting' | 'attendance' | 'reports' | 'instagram' | 'registrations';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'クラブ名順' },
  { key: 'members', label: '会員数が多い順' },
  { key: 'meetings', label: '例会数が多い順' },
  { key: 'lastMeeting', label: '直近の例会が新しい順' },
  { key: 'attendance', label: '平均参加人数が多い順' },
  { key: 'reports', label: '報告書の承認が多い順' },
  { key: 'instagram', label: 'Instagramの点数が高い順' },
  { key: 'registrations', label: '行事申込が多い順' },
];

function sortValue(c: ClubWithStats, key: SortKey): number | string {
  const s = c.stats;
  switch (key) {
    case 'members': return s.memberCount;
    case 'meetings': return s.meetingCount;
    case 'lastMeeting': return s.lastMeetingDate ?? '';
    case 'attendance': return s.avgAttendance ?? -1;
    case 'reports': return s.reportsApproved * 10000 + s.reportsSubmitted;
    case 'instagram': return s.instagramScore * 10000 + s.instagramApproved;
    case 'registrations': return s.registrationForms;
    default: return c.name;
  }
}

/** ひらがな・カタカナ・全角半角の違いを気にせず探せるようにする */
function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

export default function ClubsList({ clubs }: { clubs: ClubWithStats[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');

  const rows = useMemo(() => {
    const q = normalize(query);
    const filtered = q
      ? clubs.filter(c => normalize(`${c.name}${c.shortName ?? ''}`).includes(q))
      : clubs;
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ja');
      const va = sortValue(a, sort);
      const vb = sortValue(b, sort);
      if (va === vb) return a.name.localeCompare(b.name, 'ja');
      return va < vb ? 1 : -1; // 大きい（新しい）順
    });
  }, [clubs, query, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="クラブ名で探す"
            className="pl-9"
            aria-label="クラブ名で探す"
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="並べ替え"
        >
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      <p className="text-xs text-gray-500">
        {rows.length}クラブを表示中。例会数・出席・報告書・Instagram は今年度（7月〜翌6月）の数です。
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white max-md:border-0 max-md:bg-transparent">
        <table className="rac-table w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">クラブ名</th>
              <th className="px-3 py-2 text-right">会員数</th>
              <th className="px-3 py-2 text-right">今年度の例会数</th>
              <th className="px-3 py-2">直近の例会</th>
              <th className="px-3 py-2 text-right">平均参加人数</th>
              <th className="px-3 py-2">報告書<br className="hidden lg:inline" />（提出済/承認）</th>
              <th className="px-3 py-2">Instagram<br className="hidden lg:inline" />（承認数・点数）</th>
              <th className="px-3 py-2 text-right">行事申込</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                  {clubs.length === 0 ? 'この地区にはまだクラブが登録されていません' : '条件に合うクラブはありません'}
                </td>
              </tr>
            )}
            {rows.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td data-cell="primary" className="px-3 py-2">
                  <Link href={`/district/clubs/${c.id}`} className="rac-row-link font-medium text-indigo-700 hover:underline">
                    {c.name}
                  </Link>
                  {!c.isActive && <span className="ml-2 text-xs text-gray-400">（休止中）</span>}
                </td>
                <td data-label="会員数" className="px-3 py-2 md:text-right">{c.stats.memberCount}人</td>
                <td data-label="今年度の例会数" className="px-3 py-2 md:text-right">{c.stats.meetingCount}回</td>
                <td data-label="直近の例会" className="px-3 py-2">
                  {c.stats.lastMeetingDate ? formatYmd(c.stats.lastMeetingDate) : <span className="text-gray-400">まだありません</span>}
                </td>
                <td data-label="平均参加人数" className="px-3 py-2 md:text-right">
                  {c.stats.avgAttendance === null ? <span className="text-gray-400">—</span> : `${c.stats.avgAttendance}人`}
                </td>
                <td data-label="報告書（提出済/承認）" className="px-3 py-2">
                  {c.stats.reportsSubmitted}件 / {c.stats.reportsApproved}件
                </td>
                <td data-label="Instagram（承認・点数）" className="px-3 py-2">
                  {c.stats.instagramApproved}件・{c.stats.instagramScore}点
                </td>
                <td data-label="行事申込" className="px-3 py-2 md:text-right">{c.stats.registrationForms}件</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        平均参加人数：今年度に開催済みの例会1回あたり、そのクラブの会員が出席した人数（ゲスト・他クラブからの参加は含みません）。
      </p>
    </div>
  );
}
