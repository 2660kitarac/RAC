'use client';

/**
 * 審査画面（報告書・Instagram）で共通に使う部品
 */
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { STATUS_BADGE_CLASS } from '@/lib/district/submissions';

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

/** タブ（件数つき）。Radix の Tabs より軽い自前のボタン列 */
export function CountTabs<T extends string>({
  tabs, value, onChange,
}: {
  tabs: { key: T; label: string; count: number; highlight?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex w-full gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1" role="tablist">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900',
            )}
          >
            {t.label}
            <span
              className={cn(
                'rounded-full px-1.5 text-xs',
                t.highlight && t.count > 0 ? 'bg-amber-500 text-white' : active ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600',
              )}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 地区未設定の空状態 */
export function NoDistrict() {
  return (
    <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
      地区が設定されていません。システム管理者にアカウントの地区設定を依頼してください。
    </div>
  );
}

/** PATCH を送ってトーストを出す。成功なら true */
export async function sendPatch(url: string, body: unknown, success: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? '更新に失敗しました');
      return false;
    }
    toast.success(success);
    return true;
  } catch {
    toast.error('通信に失敗しました。電波の良いところでもう一度お試しください');
    return false;
  }
}
