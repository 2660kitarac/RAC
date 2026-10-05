'use client';

/**
 * 申込フォーム管理画面（地区役員用）で共通に使う小さな部品・関数
 */
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { isAccepting, isPastDeadline } from '@/lib/event-registration/calc';
import type { RegistrationFormConfig } from '@/lib/event-registration/types';

/** 金額の表示（例：12,000円） */
export function yen(n: number | null | undefined): string {
  return `${(n ?? 0).toLocaleString()}円`;
}

/** 今日の日付（日本時間, YYYY-MM-DD） */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 締切までの残り日数（締切日当日は 0、過ぎていれば負の数） */
export function daysLeft(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const end = new Date(`${deadline.slice(0, 10)}T00:00:00+09:00`).getTime();
  const today = new Date(`${todayJst()}T00:00:00+09:00`).getTime();
  return Math.round((end - today) / 86_400_000);
}

/** 日付の表示（例：2026/10/05（月）） */
export function formatYmd(d: string | null | undefined): string {
  if (!d) return '未設定';
  const date = new Date(`${d.slice(0, 10)}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return d;
  // 日本時間での曜日
  const w = ['日', '月', '火', '水', '木', '金', '土'][new Date(date.getTime() + 9 * 3600_000).getUTCDay()];
  return `${d.slice(0, 10).replace(/-/g, '/')}（${w}）`;
}

/** 日時の表示（DB は日本時間の文字列で持っている） */
export function formatDateTime(s: string | null | undefined): string {
  if (!s) return '';
  return s.slice(0, 16).replace('T', ' ').replace(/-/g, '/');
}

/** 新しい項目のキー（編集中に削除したキーを使い回さないよう、時刻＋連番で作る） */
let keySeq = 0;
export function newKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}${Date.now().toString(36)}${keySeq.toString(36)}`;
}

/** 画面のオリジン（https://〜）。サーバー描画時は空文字 */
const noopSubscribe = () => () => {};
export function useOrigin(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '');
}

/** 申込ページのURL */
export function entryUrl(origin: string, slug: string): string {
  return `${origin}/entry/${slug}`;
}

/** クリップボードにコピーしてトーストを出す */
export async function copyText(text: string, message = 'コピーしました') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error('コピーできませんでした。手動で選択してコピーしてください');
  }
}

/** 受付状態のバッジ */
export function FormStatusBadge({ config }: { config: Pick<RegistrationFormConfig, 'status' | 'deadline'> }) {
  if (config.status === 'draft') return <Badge variant="secondary">下書き</Badge>;
  if (isAccepting(config)) return <Badge variant="success">受付中</Badge>;
  return (
    <Badge variant="outline">
      受付終了{config.status === 'open' && isPastDeadline(config.deadline) ? '（締切済）' : ''}
    </Badge>
  );
}

/** 締切の表示（あと N 日） */
export function DeadlineText({ deadline }: { deadline: string | null | undefined }) {
  const left = daysLeft(deadline);
  if (!deadline || left === null) return <span>締切 未設定</span>;
  return (
    <span>
      締切 {formatYmd(deadline)}
      {left > 0 && <span className={left <= 3 ? 'ml-1 font-semibold text-red-600' : 'ml-1 text-gray-500'}>あと{left}日</span>}
      {left === 0 && <span className="ml-1 font-semibold text-red-600">本日締切</span>}
      {left < 0 && <span className="ml-1 text-gray-400">締切済</span>}
    </span>
  );
}

/** 入金の進み具合バー */
export function PaymentProgress({ total, paid }: { total: number; paid: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="text-gray-600">
          合計 <span className="font-semibold text-gray-900">{yen(total)}</span>
        </span>
        <span className="text-gray-600">
          入金済 <span className="font-semibold text-green-700">{yen(paid)}</span>
          <span className="ml-1 text-xs text-gray-400">({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
