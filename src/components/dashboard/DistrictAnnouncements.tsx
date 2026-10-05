'use client';

/**
 * 地区からのお知らせ（クラブ・会員のダッシュボード用）
 *  - 受け取った配列をそのまま表示する（並び順は呼び出し側で整える）
 *  - 5件を超える分は「もっと見る」で開く
 */
import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Info, Megaphone, Pin } from 'lucide-react';
import {
  ANNOUNCEMENT_LEVEL_LABELS,
  ANNOUNCEMENT_LEVEL_STYLES,
  type AnnouncementView,
} from '@/lib/district/announcements';
import { cn } from '@/lib/utils';

const MAX_VISIBLE = 5;

function formatYmd(d: string | null | undefined): string {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${Number(m[2])}月${Number(m[3])}日` : '';
}

/** お知らせ1件分（地区役員画面のプレビューでも使う） */
export function DistrictAnnouncementItem({ a }: { a: Pick<AnnouncementView, 'title' | 'body' | 'level' | 'linkUrl' | 'linkLabel' | 'pinned' | 'publishFrom' | 'createdAt'> }) {
  const style = ANNOUNCEMENT_LEVEL_STYLES[a.level] ?? ANNOUNCEMENT_LEVEL_STYLES.info;
  const Icon = a.level === 'info' ? Info : AlertTriangle;
  const [open, setOpen] = useState(false);
  const long = a.body.length > 140 || a.body.split('\n').length > 3;
  return (
    <li className={cn('rounded-lg border p-3 sm:p-4', style.box)}>
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.icon)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', style.badge)}>
              {ANNOUNCEMENT_LEVEL_LABELS[a.level]}
            </span>
            {a.pinned && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500">
                <Pin className="h-3 w-3" />固定
              </span>
            )}
            <span className="text-[11px] text-gray-500">{formatYmd(a.publishFrom || a.createdAt)}</span>
          </div>
          <p className="mt-1 break-words font-semibold text-gray-900">{a.title}</p>
          {a.body && (
            <p className={cn('mt-1 whitespace-pre-wrap break-words text-sm text-gray-700', !open && long && 'line-clamp-3')}>
              {a.body}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {long && (
              <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-medium text-gray-600 hover:underline">
                {open ? '閉じる' : '続きを読む'}
              </button>
            )}
            {a.linkUrl && (
              <a
                href={a.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 break-all text-sm font-medium text-indigo-700 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                {a.linkLabel || 'くわしくはこちら'}
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function DistrictAnnouncements({ announcements }: { announcements: AnnouncementView[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!announcements || announcements.length === 0) return null;
  const visible = expanded ? announcements : announcements.slice(0, MAX_VISIBLE);
  const rest = announcements.length - MAX_VISIBLE;

  return (
    <section aria-labelledby="district-announcements-title" className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <h2 id="district-announcements-title" className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Megaphone className="h-4 w-4 text-indigo-600" />
        地区からのお知らせ
      </h2>
      <ul className="space-y-2">
        {visible.map(a => <DistrictAnnouncementItem key={a.id} a={a} />)}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
        >
          {expanded ? <><ChevronUp className="h-4 w-4" />閉じる</> : <><ChevronDown className="h-4 w-4" />もっと見る（ほか{rest}件）</>}
        </button>
      )}
    </section>
  );
}
