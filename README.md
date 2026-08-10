# RAC Cloud

ローターアクトクラブ向けクラウド管理システム

## 技術スタック

- **Next.js 15** (App Router + Server Actions)
- **Auth.js v5 (NextAuth)** — Credentials Provider + JWT セッション
- **Cloudflare D1** — SQLite ベース分散データベース
- **Drizzle ORM** — 型安全 D1 クエリ
- **@opennextjs/cloudflare** — Next.js → Cloudflare Pages 変換

---

## 初回セットアップ手順（新規 Genspark アカウント向け）

### 1. 前提条件
- Cloudflare アカウント（無料プラン可）
- Node.js 18+
- npm または pnpm

### 2. 依存関係インストール
```bash
npm install
```

### 3. Cloudflare D1 データベース作成
```bash
# Cloudflare にログイン
npx wrangler login

# D1 データベース作成
npx wrangler d1 create rac-cloud-db

# 出力例:
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

`wrangler.jsonc` の `database_id` を出力された値に書き換える：
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "rac-cloud-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  // ← ここを変更
  }
]
```

### 4. 環境変数設定

`.dev.vars` ファイルを編集（ローカル開発用）：
```bash
# AUTH_SECRET 生成
openssl rand -base64 32
```

`.dev.vars`:
```
AUTH_SECRET=生成したランダム文字列
NEXTAUTH_URL=http://localhost:3000
RESEND_API_KEY=re_xxxxxxxxxx  # メール送信用（任意）
```

本番環境（Cloudflare Pages）へのシークレット設定：
```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
```

### 5. ローカルデータベースの初期化
```bash
# マイグレーション実行（ローカル）
npx wrangler d1 migrations apply rac-cloud-db --local

# 初期データ投入（任意）
npx wrangler d1 execute rac-cloud-db --local --file=./migrations/seed.sql
```

### 6. ローカル開発サーバー起動
```bash
npm run dev
# → http://localhost:3000
```

### 7. Cloudflare Pages へデプロイ
```bash
# ビルド
npm run build

# デプロイ（初回）
npx wrangler pages project create rac-cloud
npx wrangler pages deploy .open-next/assets --project-name rac-cloud

# 本番 D1 マイグレーション
npx wrangler d1 migrations apply rac-cloud-db
```

---

## 初期管理者アカウント作成

DB マイグレーション後、最初の管理者ユーザーを手動挿入する：

```bash
# パスワードハッシュ生成（Node.js）
node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('your-password', 10));"

# D1 にユーザー挿入
npx wrangler d1 execute rac-cloud-db --local --command="
INSERT INTO users (id, name, email, password_hash, role, member_type, is_active, created_at, updated_at)
VALUES (
  'usr_' || lower(hex(randomblob(8))),
  '管理者',
  'admin@example.com',
  '\$2a\$10\$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',  -- bcrypt ハッシュ
  'system_owner',
  'RAC',
  1,
  datetime('now'),
  datetime('now')
);"
```

---

## ディレクトリ構成

```
rac-cloud/
├── src/
│   ├── app/
│   │   ├── (auth)/         # ログイン・登録画面
│   │   ├── (dashboard)/    # 管理ダッシュボード
│   │   ├── (public)/       # 公開ページ（club/[slug]/...）
│   │   └── api/            # APIルート群
│   ├── lib/
│   │   ├── auth/           # Auth.js v5 設定
│   │   ├── db/             # Drizzle ORM スキーマ・クライアント
│   │   ├── hooks/          # useAuth など
│   │   ├── supabase/       # ★ 移行期間中の互換スタブ（将来削除）
│   │   └── utils/          # 共通ユーティリティ
│   ├── components/         # UI コンポーネント
│   └── types/              # 型定義
├── migrations/             # D1 マイグレーション SQL
├── wrangler.jsonc          # Cloudflare 設定
├── next.config.ts          # Next.js 設定
└── .dev.vars               # ローカル環境変数（gitignore）
```

---

## 主な機能

### 管理ダッシュボード（/dashboard）
- 会員管理（登録・編集・権限設定・**パスワード再設定**）
- 例会管理（作成・編集・出席管理・**例会終了処理**）
- 財務管理（収支・年会費・領収書）
- メール配信（テンプレート管理）
- CSV エクスポート
- 地区機能（地区ダッシュボード・行事管理）

### 会員向け公開ページ（/club/[slug]/）
- 会員ログイン
- 個人ダッシュボード
- 年会費確認
- 出席履歴（MU 登録履歴）
- プロフィール編集
- 領収書表示・印刷

### MU 登録（/mu/[slug]）
- 他クラブ会員向け例会登録フォーム

---

## 例会終了機能

例会当日以降に「例会終了」ボタンから終了処理を行えます。

### 操作場所
| 画面 | 表示 |
|---|---|
| 例会詳細（`/meetings/[id]`） | ヘッダー右の「例会を終了」ボタン |
| 例会一覧（`/meetings`）PC | 操作列のアイコンボタン（コンパクト表示） |
| 例会一覧（`/meetings`）スマホ | カード内の「例会を終了」ボタン |

### 仕様
- **未回答者が1名でも残っている場合は終了できません**（出席／欠席の確定を促し、出席管理画面へのリンクを表示）
- 未入金者がいる場合は**警告のみ**（終了はブロックしません）
- **会計への自動計上は行いません**（会費計上は `/finance` から手動で実施）
- 終了メモ（`closing_note`）を任意で記録でき、例会詳細に表示されます
- 終了後は「終了を取り消す」で `closed` に戻せます
- 未来日付の例会には終了ボタンを表示しません（誤操作防止）
- 終了後の次アクションリンク：例会報告書作成 / 領収書一括印刷 / 未入金者へのメール作成

### API
| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/meetings/[id]/finish` | 終了可否チェック（未回答数・未入金数・出欠集計・報告書有無） |
| `POST` | `/api/meetings/[id]/finish` | 終了実行（`{ closingNote?: string }`） |
| `DELETE` | `/api/meetings/[id]/finish` | 終了取り消し |

### DB カラム（`meetings`）
| カラム | 型 | 説明 |
|---|---|---|
| `finished_at` | text | 終了日時（ISO） |
| `finished_by` | text | 終了操作を行ったユーザーID |
| `attendance_finalized` | boolean | 出欠確定フラグ |
| `closing_note` | text | 終了メモ |

マイグレーション: `migrations/0008_meeting_closing.sql`

---

## パスワード変更機能

### 会員本人による変更
- 場所: 設定画面（`/settings`）→ セキュリティタブ
- 現在のパスワード・新しいパスワード・確認用の3項目を入力
- API: `PATCH /api/profile/password`

### クラブアカウントによる自クラブ会員のパスワード変更
- 場所: 会員一覧（`/members`）→ 各会員行の鍵アイコン
- 自動生成（英数字10桁）／手動指定の2モード
- 自動生成時のみ、生成されたパスワードが画面に表示されます（再表示不可）
- API: `POST /api/members/[id]/password`（`{ generate: true }` または `{ newPassword: string }`）

### 権限ルール
| 操作者 | 対象 | 可否 |
|---|---|---|
| 地区スタッフ（system_owner / district_admin / district_representative / district_secretary） | 全ユーザー | ✅ |
| クラブ管理者（club_account / club_admin / president / secretary） | 同一クラブの会員 | ✅ |
| クラブ管理者 | 他クラブの会員 | ❌ |
| クラブ管理者 | 地区スタッフ | ❌（権限昇格防止） |
| 一般会員 | 自分自身のみ（設定画面から） | ✅ |

### パスワード要件
- 8文字以上128文字以下
- 英字と数字をそれぞれ1文字以上含む
- 前後の空白は不可
- 現在のパスワードと同一は不可

共通ロジック: `src/lib/auth/password.ts`

---

## 環境変数一覧

| 変数名 | 必須 | 説明 |
|---|---|---|
| `AUTH_SECRET` | ✅ | Auth.js JWTシークレット（`openssl rand -base64 32`） |
| `NEXTAUTH_URL` | ローカルのみ | `http://localhost:3000` |
| `RESEND_API_KEY` | メール機能 | Resend API キー |
| `RESEND_FROM_EMAIL` | メール機能 | 送信元メールアドレス |
| `OPENAI_API_KEY` | 任意 | 例会報告書 AI 生成機能 |

---

## 注意事項

### `src/lib/supabase/` について
このディレクトリは移行期間中の互換スタブです。
`components/` 内のコンポーネントが段階的に API Route 経由に書き換えられた後、削除してください。

### D1 未定義テーブル
以下のテーブルは Supabase 専用で D1 スキーマ未定義です。将来実装が必要です：
- `award_score_items` / `award_scores` / `award_settings`（表彰機能）
- `district_events`（地区行事）
- `instagram_posts`（Instagram 投稿管理）
- `club_reports`（地区報告書）

---

## デプロイ状態

- **プラットフォーム**: Cloudflare Pages
- **ステータス**: ⚙️ セットアップ待ち（新規アカウントで初期設定が必要）
- **最終更新**: 2026-08-10
