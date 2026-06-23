'use client';

import Link from 'next/link';
import {
  UserCheck, AlertCircle, Receipt, Calendar, CreditCard,
  Clock, Bell, ChevronRight, CheckCircle
} from 'lucide-react';

interface Meeting {
  id: string;
  title: string;
  date: string;
  startTime?: string | null;
  venueName?: string | null;
}

interface AnnouncementBannerProps {
  userRole: string;
  pendingMembersCount: number;
  unpaidAnnualFees: number;
  unissuedReceipts: number;
  nextMeeting: Meeting | null;
  memberAnnualFeeStatus: { paid: boolean; year: number } | null;
}

interface Announcement {
  id: string;
  type: 'urgent' | 'warning' | 'info' | 'success';
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href?: string;
  linkText?: string;
}

export default function AnnouncementBanner({
  userRole,
  pendingMembersCount,
  unpaidAnnualFees,
  unissuedReceipts,
  nextMeeting,
  memberAnnualFeeStatus,
}: AnnouncementBannerProps) {
  const announcements: Announcement[] = [];

  const isClubAccount = userRole === 'club_account';
  const isMember = userRole === 'member';
  const isAdmin = ['system_owner', 'district_admin'].includes(userRole);
  const isClubOrAdmin = isClubAccount || isAdmin;

  // =========================================
  // クラブアカウント・管理者向けアナウンス
  // =========================================
  if (isClubOrAdmin) {
    // 1. 承認待ち会員通知
    if (pendingMembersCount > 0) {
      announcements.push({
        id: 'pending-members',
        type: 'urgent',
        icon: UserCheck,
        title: `承認待ちの会員が ${pendingMembersCount}名 います`,
        description: '新規登録した会員を承認するとログインできるようになります。早めに確認してください。',
        href: '/approvals',
        linkText: '承認管理へ',
      });
    }

    // 2. 次回例会のお知らせ
    if (nextMeeting) {
      const meetingDate = new Date(nextMeeting.date);
      const diffDays = Math.ceil((meetingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) {
        announcements.push({
          id: 'next-meeting-soon',
          type: diffDays <= 3 ? 'warning' : 'info',
          icon: Calendar,
          title: `次回例会まで ${diffDays}日 です`,
          description: `「${nextMeeting.title}」 - ${formatDate(nextMeeting.date)}${nextMeeting.startTime ? ` ${nextMeeting.startTime.substring(0, 5)}〜` : ''}${nextMeeting.venueName ? ` / ${nextMeeting.venueName}` : ''}`,
          href: `/meetings/${nextMeeting.id}`,
          linkText: '例会詳細を見る',
        });
      }
    }

    // 3. 年会費未納者通知
    if (unpaidAnnualFees > 0) {
      announcements.push({
        id: 'unpaid-fees',
        type: 'warning',
        icon: CreditCard,
        title: `年会費未納の会員が ${unpaidAnnualFees}名 います`,
        description: '年会費の徴収・管理を行い、会員に納付を促してください。',
        href: '/finance/annual-fees',
        linkText: '年会費管理へ',
      });
    }

    // 4. 未発行領収書
    if (unissuedReceipts > 0) {
      announcements.push({
        id: 'unissued-receipts',
        type: 'info',
        icon: Receipt,
        title: `未発行の領収書が ${unissuedReceipts}件 あります`,
        description: '支払い済みで領収書がまだ発行されていない件があります。',
        href: '/receipts',
        linkText: '領収書を発行する',
      });
    }
  }

  // =========================================
  // 個人会員向けアナウンス
  // =========================================
  if (isMember) {
    // 1. 次回例会の案内
    if (nextMeeting) {
      const meetingDate = new Date(nextMeeting.date);
      const diffDays = Math.ceil((meetingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 14) {
        announcements.push({
          id: 'member-next-meeting',
          type: diffDays <= 3 ? 'warning' : 'info',
          icon: Calendar,
          title: `次回例会のお知らせ（${diffDays}日後）`,
          description: `「${nextMeeting.title}」 - ${formatDate(nextMeeting.date)}${nextMeeting.startTime ? ` ${nextMeeting.startTime.substring(0, 5)}開始` : ''}${nextMeeting.venueName ? ` / ${nextMeeting.venueName}` : ''}`,
          href: `/meetings/${nextMeeting.id}`,
          linkText: '例会詳細・出欠登録',
        });
      }
    }

    // 2. 年会費未払いのお知らせ
    if (memberAnnualFeeStatus && !memberAnnualFeeStatus.paid) {
      announcements.push({
        id: 'member-fee-unpaid',
        type: 'urgent',
        icon: CreditCard,
        title: `${memberAnnualFeeStatus.year}年度の年会費が未払いです`,
        description: '年会費の納付をお願いします。クラブ担当者にご連絡ください。',
        href: '/finance/annual-fees',
        linkText: '年会費を確認する',
      });
    }

    // 3. 年会費支払い済みのお知らせ
    if (memberAnnualFeeStatus?.paid) {
      announcements.push({
        id: 'member-fee-paid',
        type: 'success',
        icon: CheckCircle,
        title: `${memberAnnualFeeStatus.year}年度の年会費は支払い済みです`,
        description: 'ありがとうございます。引き続きご参加をお待ちしています。',
      });
    }
  }

  if (announcements.length === 0) return null;

  const typeConfig = {
    urgent: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      iconColor: 'text-red-500',
      titleColor: 'text-red-800',
      descColor: 'text-red-600',
      linkColor: 'text-red-700 hover:text-red-900',
      dot: 'bg-red-500',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      iconColor: 'text-amber-500',
      titleColor: 'text-amber-800',
      descColor: 'text-amber-600',
      linkColor: 'text-amber-700 hover:text-amber-900',
      dot: 'bg-amber-500',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      iconColor: 'text-blue-500',
      titleColor: 'text-blue-800',
      descColor: 'text-blue-600',
      linkColor: 'text-blue-700 hover:text-blue-900',
      dot: 'bg-blue-500',
    },
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      iconColor: 'text-green-500',
      titleColor: 'text-green-800',
      descColor: 'text-green-600',
      linkColor: 'text-green-700 hover:text-green-900',
      dot: 'bg-green-500',
    },
  };

  return (
    <div className="space-y-2">
      {/* アナウンス見出し */}
      <div className="flex items-center gap-2 px-1">
        <Bell className="h-4 w-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">お知らせ</span>
        {announcements.filter(a => a.type === 'urgent').length > 0 && (
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        )}
      </div>

      {/* アナウンスカード一覧 */}
      {announcements.map((ann) => {
        const cfg = typeConfig[ann.type];
        const Icon = ann.icon;
        return (
          <div
            key={ann.id}
            className={`flex items-start gap-3 p-3.5 rounded-lg border ${cfg.bg} ${cfg.border}`}
          >
            <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${cfg.iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${cfg.titleColor}`}>{ann.title}</p>
              <p className={`text-xs mt-0.5 ${cfg.descColor}`}>{ann.description}</p>
            </div>
            {ann.href && ann.linkText && (
              <Link
                href={ann.href}
                className={`flex items-center gap-1 text-xs font-medium flex-shrink-0 mt-0.5 ${cfg.linkColor}`}
              >
                {ann.linkText}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
