'use client';

/**
 * 地区への提出画面（クラブ側）で共通に使う部品
 */
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { STATUS_BADGE_CLASS, meetingLabel } from '@/lib/district/submissions';
import type { MeetingOption } from '@/lib/district/submissions-server';

export type {
  ClubPostItem, ClubReportItem, ClubSubmissionsData, MeetingOption,
} from '@/lib/district/submissions-server';

/** 状態バッジ */
export function StatusPill({ status, labels }: { status: string; labels: Record<string, string> }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold',
        STATUS_BADGE_CLASS[status] ?? 'bg-gray-100 text-gray-700',
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

/** ネイティブ select の見た目 */
export const selectClass =
  'h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

/** 関連する例会の選択 */
export function MeetingSelect({
  id, value, onChange, meetings, showReportMark = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  meetings: MeetingOption[];
  showReportMark?: boolean;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      <option value="">選択しない</option>
      {meetings.map((m) => (
        <option key={m.id} value={m.id}>
          {meetingLabel(m)}
          {showReportMark && m.hasReport ? '（報告書あり）' : ''}
        </option>
      ))}
    </select>
  );
}

/** API を呼んでトーストを出す。成功ならレスポンス、失敗なら null */
export async function callApi<T = Record<string, unknown>>(
  url: string,
  init: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown },
  success?: string,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? '処理に失敗しました');
      return null;
    }
    if (success) toast.success(success);
    return data;
  } catch {
    toast.error('通信に失敗しました。電波の良いところでもう一度お試しください');
    return null;
  }
}
