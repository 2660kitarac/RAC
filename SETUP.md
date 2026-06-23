# RAC Cloud - 新環境セットアップ手順書

## 概要

このドキュメントは、RAC Cloud を新しい Genspark アカウント（大阪北RAC用）でゼロから
セットアップするための手順書です。

- **フレームワーク**: Next.js 16（App Router）
- **認証**: Auth.js（NextAuth v5）+ Credentials Provider（メール・パスワード）
- **データベース**: Cloudflare D1（SQLite）
- **ORM**: Drizzle ORM
- **ホスティング**: Cloudflare Pages（無料・スリープなし）
- **メール**: Resend（任意）

---

## 前提条件

以下をインストール済みであること:

```bash
node -v   # v18 以上
npm -v    # v9 以上
```

---

## Step 1: 新 Genspark アカウントで環境を起動

新しい Genspark アカウントにログインし、コードサンドボックスを起動します。

---

## Step 2: コードの配置

tar.gz ファイルを解凍し、所定のディレクトリに配置します:

```bash
tar -xzf rac-cloud-*.tar.gz -C /home/user/
cd /home/user/rac-cloud
```

---

## Step 3: 依存パッケージのインストール

```bash
cd /home/user/rac-cloud
npm install
```

---

## Step 4: Cloudflare アカウントと wrangler の認証

Cloudflare アカウントにログインします（Genspark の Deploy タブで CF アカウントと紐付けるか、
またはAPIキーを設定）。

```bash
# wrangler の認証確認
npx wrangler whoami
```

---

## Step 5: Cloudflare D1 データベースの作成

```bash
# D1データベースを作成
npx wrangler d1 create rac-cloud-db
```

出力例:
```
✅ Successfully created DB 'rac-cloud-db' in region APAC
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "rac-cloud-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← これをメモ
```

### wrangler.jsonc に database_id を設定

`wrangler.jsonc` を開いて、`database_id` を上記で取得した値に変更:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "rac-cloud-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  // ← ここを変更
  }
]
```

---

## Step 6: DBマイグレーションの実行

```bash
# ローカル開発用DB作成
npx wrangler d1 migrations apply rac-cloud-db --local

# 初期データ投入（クラブ・管理者ユーザー）
npx wrangler d1 execute rac-cloud-db --local --file=./migrations/seed.sql
```

### 管理者パスワードの変更（重要）

`migrations/seed.sql` のサンプルパスワード（`changeme123`）を本番用に変更します:

```bash
# Node.js でパスワードハッシュを生成
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('新しいパスワード', 12).then(h => console.log(h))"
```

生成されたハッシュで seed.sql または D1 コンソールで更新:

```sql
-- ローカルDB でパスワードを更新
npx wrangler d1 execute rac-cloud-db --local --command="
  UPDATE users SET password_hash='$2a$12$...' WHERE email='admin@osaka-kita-rac.jp'
"
```

---

## Step 7: 環境変数の設定

`.env.example` をコピーして `.dev.vars` を作成:

```bash
cp .env.example .dev.vars
```

`.dev.vars` を編集して値を入力:

```bash
# Auth.js シークレット生成（必須）
openssl rand -base64 32
```

```ini
AUTH_SECRET=生成されたシークレット
NEXTAUTH_URL=http://localhost:3000

# メール（任意）
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com

# OpenAI（任意）
OPENAI_API_KEY=sk-xxxxxxxx
```

---

## Step 8: ローカル動作確認

```bash
# ビルド
npm run build

# ローカルサーバー起動（D1ローカルDB使用）
npx wrangler pages dev .next --d1=DB --local --port 3000
```

ブラウザで http://localhost:3000 を開き、ログインを確認します。

初期管理者:
- メール: `admin@osaka-kita-rac.jp`
- パスワード: `changeme123`（← Step 6 で変更したパスワード）

---

## Step 9: Cloudflare Pages へデプロイ

### 9-1. Cloudflare Pages プロジェクトの作成

```bash
# @opennextjs/cloudflare でビルド
npm run build:cf

# Cloudflare Pages にデプロイ
npx wrangler pages deploy .open-next/assets --project-name rac-cloud
```

または Genspark の Deploy タブを使用します。

### 9-2. 本番DBマイグレーション

```bash
# 本番D1にマイグレーション適用
npx wrangler d1 migrations apply rac-cloud-db

# 本番DBにシードデータ投入
npx wrangler d1 execute rac-cloud-db --file=./migrations/seed.sql
```

### 9-3. 本番環境変数の設定

Cloudflare Pages ダッシュボード → Settings → Environment variables で設定:

| 変数名 | 値 |
|--------|-----|
| `AUTH_SECRET` | `openssl rand -base64 32` で生成 |
| `NEXTAUTH_URL` | `https://your-project.pages.dev` |
| `RESEND_API_KEY` | Resend の API キー（任意） |
| `RESEND_FROM_EMAIL` | 送信元メールアドレス（任意） |

---

## 初期管理者の変更手順

1. `migrations/seed.sql` の `email` を変更
2. パスワードハッシュを生成して `password_hash` を更新
3. クラブ名・slug を実際の値に変更

---

## ディレクトリ構造

```
rac-cloud/
├── src/
│   ├── app/
│   │   ├── (auth)/          # ログイン・登録ページ
│   │   ├── (dashboard)/     # 管理画面
│   │   ├── (public)/        # メンバー向け公開画面
│   │   ├── actions/         # Server Actions
│   │   └── api/             # API Routes
│   ├── components/          # UIコンポーネント
│   ├── lib/
│   │   ├── auth/            # Auth.js 設定
│   │   ├── db/              # Drizzle ORM スキーマ・クライアント
│   │   ├── hooks/           # React Hooks
│   │   └── utils/           # ユーティリティ
│   └── types/               # 型定義
├── migrations/
│   ├── 0001_initial_schema.sql  # DBスキーマ
│   └── seed.sql                 # 初期データ
├── .dev.vars                # ローカル環境変数（.gitignoreで除外）
├── .env.example             # 環境変数テンプレート
├── drizzle.config.ts        # Drizzle ORM設定
├── next.config.ts           # Next.js設定
├── wrangler.jsonc           # Cloudflare設定
└── package.json
```

---

## 主な変更内容（Supabase → Auth.js + D1）

| 旧（Supabase） | 新（Auth.js + D1） |
|----------------|---------------------|
| `@supabase/ssr` | `next-auth@beta` |
| `@supabase/supabase-js` | `drizzle-orm` + `bcryptjs` |
| Supabase Auth | Auth.js Credentials Provider |
| Supabase DB（PostgreSQL） | Cloudflare D1（SQLite） |
| `createClient()` | `getDbFromContext()` |
| `supabase.auth.getUser()` | `auth()` |
| `.from('table').select()` | `db.select().from(table)` |

---

## トラブルシューティング

### D1 接続エラー

`D1 Database バインディング(DB)が見つかりません` と表示される場合:

1. `wrangler.jsonc` の `database_id` が正しいか確認
2. ローカル開発時は `--local` フラグが付いているか確認
3. `.wrangler/` ディレクトリを削除して再実行

```bash
rm -rf .wrangler/
npx wrangler d1 migrations apply rac-cloud-db --local
```

### 認証エラー

`AUTH_SECRET` が設定されていない場合、Auth.js が動作しません。
`.dev.vars` に `AUTH_SECRET=` を必ず設定してください。

### ビルドエラー

`typescript.ignoreBuildErrors: true` が `next.config.ts` で設定済みのため、
型エラーはビルドを止めません。

---

## 今後の作業（未完了ページ）

以下のページは Drizzle ORM への置き換えが完了しています（主要なもの）:
✅ ダッシュボード、会員管理、例会管理、MU出席、収支管理、領収書、メール履歴
✅ 個人スマホ画面（/club/[slug]/系）
✅ 認証（ログイン・登録・ログアウト）

以下は未置き換えのため、新 Genspark アカウントで引き続き対応が必要:
- `/dashboard/meetings/[id]/` 系（例会詳細・編集・出席管理・報告書）
- `/dashboard/finance/annual-fees/` （年会費管理）
- `/dashboard/finance/donations/` （寄付管理）
- `/dashboard/emails/compose/` （メール作成）
- `/dashboard/emails/templates/` （テンプレート管理）
- `/dashboard/clubs/` （クラブ一覧）
- `/dashboard/users/` （ユーザーロール管理）
- `/dashboard/settings/` （設定）
- `/dashboard/reports/` （報告書）
- `/dashboard/csv/` （CSVエクスポート）
- `/dashboard/awards/` （アワード）
- `/dashboard/district/` 系（地区管理）
- `/api/csv/export/`, `/api/finance/create-from-attendance/`, `/api/reports/generate/`
- `src/components/` 配下の各コンポーネント（Supabase呼び出しを含む場合あり）

これらは既存ページのパターンを参考に、`getDbFromContext()` + Drizzle ORM で置き換えてください。
