'use client';

import { useState } from 'react';
import { Menu, X, Bell } from 'lucide-react';
import Sidebar, { type DistrictBadges } from './Sidebar';
import { isDistrictOfficer } from '@/lib/hooks/useAuth';
import type { User } from '@/types';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: User | null;
  pendingMembersCount?: number;
  districtLabel?: string | null;
  districtBadges?: DistrictBadges;
}

export default function DashboardLayout({ children, user, pendingMembersCount = 0, districtLabel, districtBadges }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const districtMode = isDistrictOfficer(user?.role);

  return (
    <div className="flex h-[100dvh] bg-gray-50" data-app-shell>
      {/* デスクトップサイドバー */}
      <div className="hidden lg:flex lg:flex-shrink-0 print:hidden" data-app-chrome>
        <div className="w-64">
          <Sidebar user={user} pendingMembersCount={pendingMembersCount} districtLabel={districtLabel} districtBadges={districtBadges} />
        </div>
      </div>

      {/* モバイルサイドバー */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden" data-app-chrome>
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex h-full w-[85%] max-w-xs flex-col bg-white shadow-xl">
            <div className="absolute right-4 top-4">
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="メニューを閉じる"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar user={user} onClose={() => setSidebarOpen(false)} pendingMembersCount={pendingMembersCount} districtLabel={districtLabel} districtBadges={districtBadges} />
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col overflow-hidden" data-app-body>
        {/* トップバー */}
        <header
          className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] flex-shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 pt-[env(safe-area-inset-top,0px)] sm:h-[calc(4rem+env(safe-area-inset-top,0px))] sm:px-4 print:hidden"
          data-app-chrome
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="メニューを開く"
            className="lg:hidden -ml-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* スマホ：今どのクラブで使っているかを見せる */}
          <div className="min-w-0 flex-1 lg:flex-none">
            <p className="truncate text-sm font-semibold text-gray-900 lg:hidden">
              {districtMode ? `${districtLabel || '地区'}・地区役員` : user?.club?.name || 'RAC Cloud'}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1 sm:gap-3">
            {/* 通知ベル */}
            <button
              aria-label="お知らせ"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 sm:h-10 sm:w-10"
            >
              <Bell className="h-5 w-5" />
            </button>

            {/* ユーザーアバター（モバイル） */}
            <div className={cn('lg:hidden flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full', districtMode ? 'bg-indigo-100' : 'bg-blue-100')}>
              <span className={cn('text-sm font-semibold', districtMode ? 'text-indigo-600' : 'text-blue-600')}>
                {user?.name?.charAt(0) || 'U'}
              </span>
            </div>
          </div>
        </header>

        {/* ページコンテンツ */}
        <main className="flex-1 overflow-y-auto" data-app-main>
          <div
            className="mx-auto max-w-7xl px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:p-4 md:p-6"
            data-app-content
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
