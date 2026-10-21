# 管理画面のページをロールで制限する 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面の未制限 19 ページと、サイドバーのクラブ用メニューを、1つの対応表に基づいてロールで制限する。

**Architecture:** 純粋な関数 `canAccessPage(role, path)` と対応表を `src/lib/auth/page-access.ts` に置き、サーバー側の各ページとクライアント側のサイドバーの両方から使う。

**Tech Stack:** Next.js 15（App Router）、TypeScript、テストは esbuild で実コードを読み込む node スクリプト

**Spec:** `docs/superpowers/specs/2026-10-21-dashboard-page-access-design.md`

## Global Constraints

- 作業ブランチ：`claude/dashboard-page-access`（main `4a024c4` から）
- 開けないページは `redirect('/dashboard')`
- 対応表にないパスは制限しない。前方一致は `path === prefix || path.startsWith(prefix + '/')`
- `page-access.ts` はクライアントからも読み込むため、`next/navigation` や `auth` を import しない
- `password.txt`（未追跡）は絶対にコミットしない。`git add` はファイルを個別に指定する
- 変更したファイルの Lint のエラー・警告数を main から増やさない

---

### Task 1: 対応表と判定関数

**Files:**
- Create: `src/lib/auth/page-access.ts`
- Test: `scripts/test-page-access.mjs`

**Interfaces:**
- Produces: `canAccessPage(role: string | null | undefined, path: string): boolean`

- [ ] **Step 1: 失敗するテストを書く**（`scripts/test-page-access.mjs`。ハーネスは `scripts/test-permissions.mjs` と同じ。stdin は `export * from './src/lib/auth/page-access';`）

```js
const can = m.canAccessPage;
console.log('--- 一般会員 ---');
t('ダッシュボードは開ける（表にない）', can('member', '/dashboard'), true);
t('収支一覧は開けない', can('member', '/finance/transactions'), false);
t('会員管理は開けない', can('member', '/members'), false);
t('例会詳細は開けない', can('member', '/meetings/abc'), false);
t('メール作成は開けない', can('member', '/emails/compose'), false);
t('報告書は開けない', can('member', '/reports'), false);
t('ユーザー権限は開けない', can('member', '/users'), false);
t('設定は開けない', can('member', '/settings'), false);
t('CSVは開けない', can('member', '/csv'), false);
t('領収書一覧は開けない', can('member', '/receipts'), false);
console.log('--- 幹事（secretary） ---');
t('例会一覧は開ける', can('secretary', '/meetings'), true);
t('メール作成は開ける', can('secretary', '/emails/compose'), true);
t('収支一覧は開けない', can('secretary', '/finance/transactions'), false);
t('ユーザー権限は開けない', can('secretary', '/users'), false);
console.log('--- 会計（treasurer） ---');
t('収支一覧は開ける', can('treasurer', '/finance/annual-fees'), true);
t('報告書は開ける', can('treasurer', '/reports'), true);
t('メール作成は開けない', can('treasurer', '/emails/compose'), false);
console.log('--- 会長・クラブアカウント・地区管理者 ---');
t('会長はメール作成を開ける', can('president', '/emails/history'), true);
t('会長はユーザー権限を開けない', can('president', '/users'), false);
t('クラブアカウントはユーザー権限を開ける', can('club_account', '/users'), true);
t('地区管理者は収支一覧を開ける', can('district_admin', '/finance/transactions'), true);
console.log('--- パスの一致 ---');
t('/membersx は /members の規則に当たらない', can('member', '/membersx'), true);
t('ロールなしは制限ページを開けない', can(null, '/members'), false);
t('ロールなしでも表にないパスは開ける', can(undefined, '/dashboard'), true);
```

- [ ] **Step 2: 失敗を確認**：`node scripts/test-page-access.mjs` → page-access が見つからず失敗
- [ ] **Step 3: 実装**（`src/lib/auth/page-access.ts`）

```ts
import { canManageFinance, canManageClub } from '@/lib/auth/tenant';

type Role = string | null | undefined;

const ACCOUNT_MANAGER_ROLES = ['system_owner', 'district_admin', 'club_account', 'club_admin'];
const EMAIL_SENDER_ROLES = ['system_owner', 'district_admin', 'club_account', 'club_admin', 'president', 'secretary'];
const REPORT_VIEWER_ROLES = [
  'system_owner', 'district_admin', 'club_account', 'club_admin', 'president', 'secretary',
  'treasurer', 'district_representative', 'district_secretary', 'zone_representative', 'sponsor_rotarian',
];

const hasRole = (roles: string[]) => (role: Role) => !!role && roles.includes(role);

/** ユーザー権限（ロールの変更）を扱えるロール */
export const canManageAccounts = hasRole(ACCOUNT_MANAGER_ROLES);
/** メールの作成・履歴・テンプレートを扱えるロール */
export const canSendEmails = hasRole(EMAIL_SENDER_ROLES);
/** 例会報告書を見られるロール */
export const canViewReports = hasRole(REPORT_VIEWER_ROLES);

/**
 * 管理画面のページ → 開けるロール（#48）。パスの前方一致で判定し、表にないパスは制限しない。
 * サーバー側の各ページとサイドバーの両方で使う。
 */
const PAGE_ACCESS_RULES: { prefix: string; allow: (role: Role) => boolean }[] = [
  { prefix: '/finance', allow: canManageFinance },
  { prefix: '/receipts', allow: canManageFinance },
  { prefix: '/members', allow: canManageClub },
  { prefix: '/meetings', allow: canManageClub },
  { prefix: '/clubs', allow: canManageClub },
  { prefix: '/csv', allow: canManageClub },
  { prefix: '/settings', allow: canManageClub },
  { prefix: '/users', allow: canManageAccounts },
  { prefix: '/emails', allow: canSendEmails },
  { prefix: '/reports', allow: canViewReports },
];

export function canAccessPage(role: Role, path: string): boolean {
  const rule = PAGE_ACCESS_RULES.find((r) => path === r.prefix || path.startsWith(r.prefix + '/'));
  return rule ? rule.allow(role) : true;
}
```

- [ ] **Step 4: 成功を確認**：`node scripts/test-page-access.mjs` → `24 passed / 0 failed`
- [ ] **Step 5: コミット**

### Task 2: 19 ページに確認を入れる

各ページの `if (!session?.user) redirect('/login');` の直後に `if (!canAccessPage(session.user.role, '<パス>')) redirect('/dashboard');` を入れ、`import { canAccessPage } from '@/lib/auth/page-access';` を追加する。`[id]` のページはパスに `/meetings/[id]` の代わりに `/meetings/detail` などではなく、そのまま `'/meetings'` 配下として `'/meetings/[id]'` の文字列を渡してよい（前方一致で `/meetings` の規則に当たる）。

対象と渡すパス：`finance/transactions`→`/finance/transactions`、`finance/annual-fees`→`/finance/annual-fees`、`finance/donations`→`/finance/donations`、`members`→`/members`、`members/mu-visits`→`/members/mu-visits`、`users`→`/users`、`emails/compose`→`/emails/compose`、`emails/history`→`/emails/history`、`emails/templates`→`/emails/templates`、`meetings`→`/meetings`、`meetings/reception`→`/meetings/reception`、`meetings/[id]`・`meetings/[id]/attendances`・`meetings/[id]/edit`・`meetings/[id]/report`→`/meetings/[id]`、`clubs`→`/clubs`、`csv`→`/csv`、`reports`→`/reports`、`settings`→`/settings`

確認：19 ファイルすべてに `canAccessPage(` があること（grep）、型チェック、Lint 件数。コミット。

### Task 3: サイドバー

`Sidebar.tsx` で、クラブ用の `navItems`（と設定の項目）を `canAccessPage(role, href)` で絞り込む関数を通してから描画する。子は個別に判定し、子が0件になった親は消す。#46 の領収書専用の分岐（`canManageFinance(role) ? [...] : []`）は通常の項目に戻し、絞り込みに任せる。確認：型チェック・Lint。コミット。

### Task 4: 確認・レビュー・PR

テスト（`test-page-access`・`test-permissions`・`test-tenant-isolation`）、型チェック、`/code-review`、push、PR（Closes #48。API は別 Issue として PR に記載）。
