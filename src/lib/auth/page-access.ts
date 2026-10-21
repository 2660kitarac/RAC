/**
 * 管理画面のページごとに、開けるロールを決める（#48）
 *
 * サーバー側の各ページ（開けなければ /dashboard へ）とサイドバー（開けない項目は出さない）の
 * 両方で使うため、next/navigation や auth を import しない純粋な関数だけで構成する。
 */
import { canManageFinance, canManageClub } from '@/lib/auth/tenant';

type Role = string | null | undefined;

// ロールの一覧はクライアント側 @/lib/hooks/useAuth の isClubAccount・canViewReports と同じ
const ACCOUNT_MANAGER_ROLES = ['system_owner', 'district_admin', 'club_account', 'club_admin'];
// 他クラブMU訪問管理（サイドバーで出していた範囲）
const MU_VISIT_MANAGER_ROLES = ['system_owner', 'district_admin', 'club_account', 'club_admin', 'president'];
const REPORT_VIEWER_ROLES = [
  'system_owner', 'district_admin', 'club_account', 'club_admin', 'president', 'secretary',
  'treasurer', 'district_representative', 'district_secretary', 'zone_representative', 'sponsor_rotarian',
];

const hasRole = (roles: string[]) => (role: Role) => !!role && roles.includes(role);

/** ユーザー権限（ロールの変更）を扱えるロール */
export const canManageAccounts = hasRole(ACCOUNT_MANAGER_ROLES);
/** 他クラブMU訪問管理を扱えるロール */
export const canManageMuVisits = hasRole(MU_VISIT_MANAGER_ROLES);
/** 例会報告書を見られるロール */
export const canViewReports = hasRole(REPORT_VIEWER_ROLES);

/**
 * ページ（パスの先頭）→ 開けるロール。表にないパスは制限しない。
 * /settings はプロフィール・パスワード変更など全員が使うため載せない（クラブ設定のタブは画面側で出し分け済み）。
 * 前から順に探すので、狭い規則（/members/mu-visits）は広い規則（/members）より前に置く。
 */
const PAGE_ACCESS_RULES: { prefix: string; allow: (role: Role) => boolean }[] = [
  { prefix: '/finance', allow: canManageFinance },
  { prefix: '/receipts', allow: canManageFinance },
  { prefix: '/members/mu-visits', allow: canManageMuVisits },
  { prefix: '/members', allow: canManageClub },
  { prefix: '/meetings', allow: canManageClub },
  { prefix: '/clubs', allow: canManageClub },
  { prefix: '/csv', allow: canManageClub },
  { prefix: '/users', allow: canManageAccounts },
  // メールの API（/api/emails/*）と同じ範囲
  { prefix: '/emails', allow: canManageClub },
  { prefix: '/reports', allow: canViewReports },
];

/** そのロールでページ（path）を開いてよいか。前方一致（/x と /x/...）で規則を探す */
export function canAccessPage(role: Role, path: string): boolean {
  const rule = PAGE_ACCESS_RULES.find((r) => path === r.prefix || path.startsWith(r.prefix + '/'));
  return rule ? rule.allow(role) : true;
}
