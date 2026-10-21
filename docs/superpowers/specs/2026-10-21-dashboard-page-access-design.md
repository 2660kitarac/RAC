# 管理画面のページをロールで制限する（Issue #48）

- 作成日：2026-10-21
- 対象 Issue：#48「管理画面の多くのページが、ログインしていればロールに関係なく開ける」
- 状態：設計承認済み（ページごとのロールは提案どおり。API は別 Issue）

## 1. 背景

管理画面（`src/app/(dashboard)/`）の多くのページは、ページの中でログインの有無しか確認していない。レイアウト（`(dashboard)/layout.tsx`）とミドルウェアもログインの有無しか見ていない。一般会員（member）もログインすると `/dashboard` に入るため、URL を開けば収支・会員の個人情報・メール履歴などを表示できる。サイドバーには一般会員にも管理メニューがすべて出ている。

調査の結果（2026-10-21）：
- 地区のページ（`district/*`）と `district-submissions` は `requireDistrictPage` / `getSubmitter` で制限済み
- 領収書（`receipts/*`）は #41・#46 で制限済み
- `meetings/new`・`meetings/[id]/resume`・`approvals`・`clubs/accounts` は個別に制限済み
- 下記 19 ページが未制限

## 2. ページごとに開けるロール

対応表を `src/lib/auth/page-access.ts` に1つだけ置く。パスの前方一致（`/x` と `/x/...`）で判定し、表にないパスは制限しない。

| パスの先頭 | 開けるロール | 判定 |
|---|---|---|
| `/finance` | 会長・会計・クラブ管理者・クラブアカウント・地区スタッフ | `canManageFinance`（tenant.ts） |
| `/receipts` | 同上 | `canManageFinance`（サイドバー用。ページは制限済み） |
| `/members` | クラブの役員（会長・幹事・会計・クラブ管理者・クラブアカウント）・地区スタッフ | `canManageClub`（tenant.ts） |
| `/meetings` | 同上 | `canManageClub` |
| `/clubs` | 同上 | `canManageClub`（`/clubs/accounts` はページ側でさらに限定済み） |
| `/csv` | 同上 | `canManageClub` |
| `/settings` | 同上 | `canManageClub` |
| `/users` | system_owner・地区管理者・クラブアカウント・クラブ管理者 | 新規 `canManageAccounts` |
| `/emails` | system_owner・地区管理者・クラブアカウント・クラブ管理者・会長・幹事 | 新規 `canSendEmails` |
| `/reports` | system_owner・地区管理者・クラブアカウント・クラブ管理者・会長・幹事・会計・地区代表・地区幹事・ゾーン代表・提唱ロータリアン | 新規 `canViewReports` |

新規の3つのロール一覧は、クライアント側 `src/lib/hooks/useAuth.ts` の `isClubAccount`・`canSendEmails`・`canViewReports` と同じにする。

## 3. ページでの確認

対象 19 ページで、`if (!session?.user) redirect('/login');` の直後に次を入れる。

```ts
if (!canAccessPage(session.user.role, '<そのページのパス>')) redirect('/dashboard');
```

対象：`finance/transactions`・`finance/annual-fees`・`finance/donations`・`members`・`members/mu-visits`・`users`・`emails/compose`・`emails/history`・`emails/templates`・`meetings`・`meetings/reception`・`meetings/[id]`・`meetings/[id]/attendances`・`meetings/[id]/edit`・`meetings/[id]/report`・`clubs`・`csv`・`reports`・`settings`

## 4. サイドバー

`src/components/layout/Sidebar.tsx` のクラブ用メニュー（地区モード以外）を、同じ `canAccessPage` で絞り込む。子メニューは1つずつ判定し、子がすべて消えた親メニューは表示しない。#46 で入れた領収書専用の分岐は、この絞り込みに置き換える。

## 5. テスト

`scripts/test-page-access.mjs`（既存の `test-permissions.mjs` と同じ形）で `canAccessPage` を検証する。一般会員・幹事・会計・会長・クラブアカウント・地区管理者・ロールなしについて、代表的なパス（前方一致・表にないパス・`/members` と `/membersx` の区別を含む）を確認する。

## 6. 対象外

- ページの裏の API の権限確認（別 Issue）
- 開けないページを開いたときの案内表示（ほかの画面と同じく `/dashboard` に戻す）
