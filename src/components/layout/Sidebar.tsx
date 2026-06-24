'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Calendar, Users, Building2, Receipt,
  Mail, FileText, BarChart3, Settings, ChevronDown,
  ChevronRight, LogOut, Award, Globe, CreditCard, UserCheck,
  Heart, TrendingUp, Bell, Key, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User } from '@/types';
import { isDistrictStaff, isClubAdmin, canManageFinance, canManageReceipts, canSendEmails, canManageAwards } from '@/lib/hooks/useAuth';
import { signOut } from '@/app/actions/auth';

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
  roles?: string[];
  badge?: number;
}

interface SidebarProps {
  user: User | null;
  onClose?: () => void;
  pendingMembersCount?: number;  // 承認待ち会員数（バッジ表示用）
}

export default function Sidebar({ user, onClose, pendingMembersCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = useState<string[]>(['meetings']);
  const role = user?.role;

  const toggleExpand = (label: string) => {
    setExpandedItems(prev =>
      prev.includes(label) ? prev.filter(i => i !== label) : [...prev, label]
    );
  };

  const navItems: NavItem[] = [
    {
      label: 'ダッシュボード',
      href: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: '例会管理',
      icon: Calendar,
      children: [
        { label: '例会一覧', href: '/meetings', icon: Calendar },
        { label: '例会作成', href: '/meetings/new', icon: Calendar },
        { label: '出席管理', href: '/meetings', icon: UserCheck },
        { label: '当日受付', href: '/meetings/reception', icon: UserCheck },
      ],
    },
    {
      label: 'MU・登録管理',
      icon: Globe,
      children: [
        { label: 'MU登録者一覧', href: '/attendances', icon: Users },
      ],
    },
    {
      label: '会員管理',
      href: '/members',
      icon: Users,
    },
    {
      label: 'クラブ管理',
      href: '/clubs',
      icon: Building2,
    },
    {
      label: '収支管理',
      icon: TrendingUp,
      children: [
        { label: '収支一覧', href: '/finance/transactions', icon: TrendingUp },
        { label: '年会費管理', href: '/finance/annual-fees', icon: CreditCard },
        { label: 'ニコニコ管理', href: '/finance/donations', icon: Heart },
      ],
    },
    {
      label: '領収書管理',
      icon: Receipt,
      children: [
        { label: '領収書一覧', href: '/receipts', icon: Receipt },
      ],
    },
    {
      label: 'メール管理',
      icon: Mail,
      children: [
        { label: 'メール作成', href: '/emails/compose', icon: Mail },
        { label: '送信履歴', href: '/emails/history', icon: Mail },
        { label: 'テンプレート', href: '/emails/templates', icon: FileText },
      ],
    },
    {
      label: '報告書・AI',
      icon: FileText,
      children: [
        { label: '例会報告書', href: '/reports', icon: FileText },
        { label: 'AI生成履歴', href: '/reports/ai-logs', icon: FileText },
      ],
    },
    {
      label: 'CSV出力',
      href: '/csv',
      icon: BarChart3,
    },
  ];

  // 地区役員向けメニュー
  if (isDistrictStaff(role)) {
    navItems.push({
      label: '地区管理',
      icon: Globe,
      children: [
        { label: '地区ダッシュボード', href: '/district/dashboard', icon: LayoutDashboard },
        { label: '地区行事', href: '/district/events', icon: Calendar },
        { label: '報告書管理', href: '/district/reports', icon: FileText },
        { label: 'Instagram管理', href: '/district/instagram', icon: Globe },
        { label: 'カレンダー管理', href: '/district/calendar', icon: Calendar },
      ],
    });

    navItems.push({
      label: '表彰管理',
      icon: Award,
      children: [
        { label: '表彰ダッシュボード', href: '/awards/district-dashboard', icon: Award },
        { label: '表彰設定', href: '/awards/settings', icon: Settings },
      ],
    });
  }

  // クラブアカウント・管理者向け：承認管理
  if (role === 'club_account' || role === 'system_owner' || role === 'district_admin' || role === 'club_admin' || role === 'president') {
    navItems.push({
      label: '会員承認管理',
      href: '/approvals',
      icon: ShieldCheck,
      badge: pendingMembersCount,
    });
  }

  // system_owner / district_admin 向け：クラブアカウント管理
  if (role === 'system_owner' || role === 'district_admin') {
    navItems.push({
      label: 'クラブアカウント',
      href: '/clubs/accounts',
      icon: Key,
    });
  }

  navItems.push({
    label: '設定',
    icon: Settings,
    children: [
      { label: '設定', href: '/settings', icon: Settings },
      { label: 'ユーザー権限', href: '/users', icon: Users },
    ],
  });

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const renderNavItem = (item: NavItem, depth = 0) => {
    const isExpanded = expandedItems.includes(item.label);
    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren) {
      return (
        <div key={item.label}>
          <button
            onClick={() => toggleExpand(item.label)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors',
              'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
              depth > 0 && 'pl-6'
            )}
          >
            <span className="flex items-center gap-2">
              <item.icon className="h-4 w-4" />
              {item.label}
            </span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {isExpanded && (
            <div className="mt-1 ml-3 pl-3 border-l border-gray-200">
              {item.children!.map(child => renderNavItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    if (!item.href) return null;

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
          isActive(item.href)
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
          depth > 0 && 'text-xs py-1.5'
        )}
      >
        <item.icon className="h-4 w-4 flex-shrink-0" />
        <span>{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="ml-auto bg-red-100 text-red-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* ロゴ */}
      <div className="flex items-center h-16 px-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">RAC Cloud</p>
            <p className="text-xs text-gray-500 truncate max-w-[140px]">
              {user?.club?.name || 'クラブ管理システム'}
            </p>
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map(item => renderNavItem(item))}
      </nav>

      {/* ユーザー情報 */}
      <div className="flex-shrink-0 border-t border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-blue-600 font-semibold text-sm">
              {user?.name?.charAt(0) || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            title="ログアウト"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
