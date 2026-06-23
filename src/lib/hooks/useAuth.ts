'use client';

import { useSession } from 'next-auth/react';
import type { UserRole } from '@/types';

interface AuthState {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    clubId: string | null;
    status: string;
  } | null;
  loading: boolean;
  isAuthenticated: boolean;
}

export function useAuth(): AuthState {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return { user: null, loading: true, isAuthenticated: false };
  }

  if (!session?.user) {
    return { user: null, loading: false, isAuthenticated: false };
  }

  return {
    user: {
      id: session.user.id!,
      email: session.user.email!,
      name: session.user.name!,
      role: (session.user as any).role || 'member',
      clubId: (session.user as any).clubId || null,
      status: (session.user as any).status || 'active',
    },
    loading: false,
    isAuthenticated: true,
  };
}

// ============================================================
// 権限チェックユーティリティ（簡素化4ロール対応）
// ============================================================
export function hasRole(userRole: UserRole | undefined, allowedRoles: UserRole[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}

/** 全権管理者（system_owner） */
export function isSystemAdmin(role: UserRole | undefined): boolean {
  return hasRole(role, ['system_owner']);
}

/** 地区管理者以上（system_owner / district_admin） */
export function isDistrictAdmin(role: UserRole | undefined): boolean {
  return hasRole(role, ['system_owner', 'district_admin']);
}

/** クラブアカウント以上（system_owner / district_admin / club_account / 旧club_admin） */
export function isClubAccount(role: UserRole | undefined): boolean {
  return hasRole(role, ['system_owner', 'district_admin', 'club_account', 'club_admin']);
}

/** 後方互換: isClubAdmin → isClubAccount に統合 */
export function isClubAdmin(role: UserRole | undefined): boolean {
  return isClubAccount(role);
}

/** ダッシュボードにアクセスできるか（club_account以上） */
export function canAccessDashboard(role: UserRole | undefined): boolean {
  return hasRole(role, ['system_owner', 'district_admin', 'club_account', 'club_admin', 'president', 'secretary', 'treasurer']);
}

/** 例会運営（club_account以上） */
export function canManageMeetings(role: UserRole | undefined): boolean {
  return hasRole(role, [
    'system_owner', 'district_admin', 'club_account', 'club_admin', 'president', 'secretary'
  ]);
}

/** 会計管理 */
export function canManageFinance(role: UserRole | undefined): boolean {
  return hasRole(role, [
    'system_owner', 'district_admin', 'club_account', 'club_admin', 'treasurer', 'president'
  ]);
}

/** 領収書管理 */
export function canManageReceipts(role: UserRole | undefined): boolean {
  return hasRole(role, [
    'system_owner', 'district_admin', 'club_account', 'club_admin', 'treasurer'
  ]);
}

/** メール送信 */
export function canSendEmails(role: UserRole | undefined): boolean {
  return hasRole(role, [
    'system_owner', 'district_admin', 'club_account', 'club_admin', 'president', 'secretary'
  ]);
}

/** レポート閲覧 */
export function canViewReports(role: UserRole | undefined): boolean {
  return hasRole(role, [
    'system_owner', 'district_admin', 'club_account', 'club_admin', 'president', 'secretary',
    'treasurer', 'district_representative', 'district_secretary', 'zone_representative',
    'sponsor_rotarian'
  ]);
}

/** 表彰管理 */
export function canManageAwards(role: UserRole | undefined): boolean {
  return hasRole(role, [
    'system_owner', 'district_admin', 'district_representative',
    'district_secretary', 'zone_representative'
  ]);
}

/** 承認操作（club_account以上） */
export function canApproveMembers(role: UserRole | undefined): boolean {
  return hasRole(role, ['system_owner', 'district_admin', 'club_account', 'club_admin']);
}
