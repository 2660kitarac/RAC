'use client';

/**
 * スマホ用の下部タブ（よく使う画面へ片手で移動するためのもの）
 * - 画面幅が lg 未満のときだけ表示する（PC はサイドバーを使う）
 * - 右端の「メニュー」で、これまでどおりのメニュー（全項目）を開く
 * - 下部タブが不要なロール（一般会員など）では何も表示しない
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Calendar, ClipboardList, FileCheck, Menu,
  UserCheck, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** この URL で始まる画面にいるときも選択中にする */
  match?: string[];
  badge?: number;
};

/** 例会運営をするクラブ側のロール */
const CLUB_STAFF_ROLES = ['system_owner', 'district_admin', 'club_account', 'club_admin', 'president', 'secretary', 'treasurer'];

/**
 * 下部タブを出さない画面（編集画面には独自の「保存」バーが画面下にあり、重なってしまうため）
 */
const HIDE_ON = [
  /\/new$/,                          // 例会作成・申込フォーム作成
  /\/edit$/,                         // 例会の編集
  /^\/meetings\/[^/]+\/resume/,       // レジュメ作成
  /^\/district\/registrations\/[^/]+\/settings$/, // 申込フォームの設定
];

export function shouldShowBottomNav(pathname: string | null | undefined): boolean {
  const p = pathname || '';
  return !HIDE_ON.some(re => re.test(p));
}

export function bottomTabsFor(
  role: string | null | undefined,
  districtMode: boolean,
  badges?: { reports?: number; instagram?: number },
): Tab[] {
  if (districtMode) {
    const reviewCount = (badges?.reports ?? 0) + (badges?.instagram ?? 0);
    return [
      { label: 'ホーム', href: '/district/dashboard', icon: LayoutDashboard },
      { label: '行事', href: '/district/events', icon: Calendar, match: ['/district/events', '/district/calendar'] },
      { label: '申込', href: '/district/registrations', icon: ClipboardList },
      { label: '審査', href: '/district/reports', icon: FileCheck, match: ['/district/reports', '/district/instagram'], badge: reviewCount },
    ];
  }
  if (role && CLUB_STAFF_ROLES.includes(role)) {
    return [
      { label: 'ホーム', href: '/dashboard', icon: LayoutDashboard },
      { label: '例会', href: '/meetings', icon: Calendar, match: ['/meetings'] },
      { label: '受付', href: '/meetings/reception', icon: UserCheck },
      { label: '会員', href: '/members', icon: Users, match: ['/members', '/approvals'] },
    ];
  }
  return [];
}

interface BottomNavProps {
  tabs: Tab[];
  onOpenMenu: () => void;
}

export default function BottomNav({ tabs, onOpenMenu }: BottomNavProps) {
  const pathname = usePathname() || '';
  if (tabs.length === 0) return null;

  // 一番具体的に一致するタブだけを選択中にする（/meetings と /meetings/reception の両方が光らないように）
  const score = (t: Tab) => {
    const keys = [t.href, ...(t.match ?? [])];
    let best = -1;
    for (const k of keys) {
      if (pathname === k || pathname.startsWith(k + '/')) best = Math.max(best, k.length);
    }
    return best;
  };
  const scores = tabs.map(score);
  const activeIndex = scores.reduce((bi, s, i) => (s > (scores[bi] ?? -1) ? i : bi), -1);

  return (
    <nav
      aria-label="よく使う画面"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur lg:hidden print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      data-app-chrome
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((t, i) => {
          const active = i === activeIndex && scores[i] >= 0;
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  active ? 'text-blue-600' : 'text-gray-500 active:bg-gray-100',
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{t.label}</span>
                {!!t.badge && t.badge > 0 && (
                  <span className="absolute right-[calc(50%-1.25rem)] top-1.5 min-w-[1.125rem] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-[1.125rem] text-white">
                    {t.badge > 99 ? '99+' : t.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-gray-500 active:bg-gray-100"
          >
            <Menu className="h-5 w-5" />
            <span>メニュー</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
