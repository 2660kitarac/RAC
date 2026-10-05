/**
 * 地区ダッシュボード・クラブ画面で共通に使う小さな表示部品（サーバーコンポーネントでも使える）
 */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { percent, yen } from './format';

/** 見出し付きのカード */
export function Section({
  title, icon: Icon, action, children, className,
}: {
  title: string;
  icon?: LucideIcon;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('min-w-0 p-4 sm:p-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-gray-900">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-indigo-600" />}
          <span className="truncate">{title}</span>
        </h2>
        {action && (
          <Link href={action.href} className="flex shrink-0 items-center text-sm text-indigo-700 hover:underline">
            {action.label}
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

/** 数字のタイル */
export function StatTile({
  label, value, unit, icon: Icon, note, href,
}: {
  label: string;
  value: number | string;
  unit?: string;
  icon?: LucideIcon;
  note?: string;
  href?: string;
}) {
  const body = (
    <Card className={cn('h-full p-4', href && 'transition-colors hover:border-indigo-300 hover:bg-indigo-50/40')}>
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        {Icon && <Icon className="h-4 w-4 text-indigo-500" />}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-gray-500">{unit}</span>}
      </div>
      {note && <div className="mt-1 text-xs text-gray-500">{note}</div>}
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

/** データが無いときの一言 */
export function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">{children}</p>;
}

/** 入金の進み具合バー */
export function PaymentBar({ total, paid }: { total: number; paid: number }) {
  const pct = percent(paid, total);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-gray-600">
        <span>入金 {yen(paid)} / {yen(total)}</span>
        <span className="font-semibold text-gray-800">{total > 0 ? `${pct}%` : '—'}</span>
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100"
        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="入金率"
      >
        <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-green-500' : 'bg-indigo-500')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 報告書の状態バッジ */
export function ReportStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'approved': return <Badge variant="success">承認</Badge>;
    case 'submitted': return <Badge variant="warning">審査待ち</Badge>;
    case 'rejected': return <Badge variant="destructive">差し戻し</Badge>;
    case 'draft': return <Badge variant="secondary">下書き</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

/** Instagram 投稿の状態バッジ */
export function InstagramStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'approved': return <Badge variant="success">承認</Badge>;
    case 'pending': return <Badge variant="warning">審査待ち</Badge>;
    case 'rejected': return <Badge variant="destructive">差し戻し</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

/** 申込の入金状況バッジ */
export function PaymentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'paid': return <Badge variant="success">入金済</Badge>;
    case 'partial': return <Badge variant="warning">一部入金</Badge>;
    default: return <Badge variant="destructive">未入金</Badge>;
  }
}

/** 例会の状態バッジ */
export function MeetingStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'open': return <Badge variant="info">募集中</Badge>;
    case 'closed': return <Badge variant="secondary">締切</Badge>;
    case 'finished': return <Badge variant="success">終了</Badge>;
    case 'cancelled': return <Badge variant="destructive">中止</Badge>;
    case 'published': return <Badge variant="info">公開中</Badge>;
    case 'draft': return <Badge variant="secondary">下書き</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}
