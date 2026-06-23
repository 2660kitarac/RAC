# RAC Cloud デプロイ手順

## 1. Supabase セットアップ

### 1-1. プロジェクト作成
1. https://supabase.com にアクセス → 「New project」
2. プロジェクト名: `rac-cloud`、リージョン: `Northeast Asia (Tokyo)` を選択
3. 作成後、**Settings → API** から以下をコピー:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`

### 1-2. マイグレーション実行
Supabase ダッシュボードの **SQL Editor** で以下を順番に実行:

```
supabase/migrations/001_initial_schema.sql  # テーブル定義・インデックス
supabase/migrations/002_rls_policies.sql    # Row Level Security ポリシー
supabase/migrations/003_seed_data.sql       # 初期データ（地区・クラブ・テンプレート等）
```

### 1-3. 認証設定
Supabase ダッシュボードの **Authentication → URL Configuration**:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/**`

### 1-4. Storage バケット作成（任意・報告書PDF保存用）
SQL Editor で実行:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false);
```

---

## 2. GitHub リポジトリ作成

```bash
# GitHubで新規リポジトリを作成後
cd /home/user/rac-cloud
git remote add origin https://github.com/YOUR_USERNAME/rac-cloud.git
git push -u origin main
```

---

## 3. Vercel デプロイ

### 方法A: Vercel CLI（推奨）
```bash
npm i -g vercel
cd /home/user/rac-cloud
vercel --prod
```

### 方法B: Vercel ダッシュボード
1. https://vercel.com → 「New Project」
2. GitHubリポジトリを選択
3. Framework: `Next.js` （自動検出）
4. 環境変数を設定（後述）
5. 「Deploy」ボタンをクリック

### 環境変数（Vercel ダッシュボード → Settings → Environment Variables）

| 変数名 | 値 | 環境 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | All |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Production |
| `RESEND_API_KEY` | `re_...` | All（任意） |
| `RESEND_FROM_EMAIL` | `noreply@your-domain.com` | All（任意） |
| `OPENAI_API_KEY` | `sk-...` | All（任意） |
| `OPENAI_MODEL` | `gpt-4o-mini` | All（任意） |

---

## 4. デプロイ後の初期設定

### 4-1. テストユーザー作成
Supabase **Authentication → Users → Add user** で各ロールのユーザーを作成し、
`users` テーブルの `auth_user_id` カラムを Supabase Auth の UUID で更新:

```sql
-- 例: admin@osaka-kita-rac.jp のauth_user_idを設定
UPDATE users
SET auth_user_id = 'supabase-auth-uuid-here'
WHERE email = 'admin@osaka-kita-rac.jp';
```

### 4-2. 動作確認チェックリスト
- [ ] ログイン画面が表示される
- [ ] admin@osaka-kita-rac.jp でログインできる
- [ ] ダッシュボードが表示される
- [ ] 例会一覧にテストデータが表示される
- [ ] MU登録フォーム（/mu/[slug]）が公開アクセスできる

---

## 5. ローカル開発環境

```bash
# 1. リポジトリクローン
git clone https://github.com/YOUR_USERNAME/rac-cloud.git
cd rac-cloud

# 2. 依存パッケージインストール
npm install

# 3. 環境変数設定
cp .env.example .env.local
# .env.local にSupabase URLとキーを設定

# 4. 開発サーバー起動
npm run dev
# → http://localhost:3000
```

---

## 6. トラブルシューティング

### ビルドエラー: `Cannot apply unknown utility class`
→ `globals.css` の `@apply` でカスタムクラスを使用していないか確認

### ログイン後にリダイレクトループ
→ Supabase の Site URL / Redirect URLs の設定を確認

### RLSでデータが取得できない
→ `users` テーブルの `auth_user_id` が Supabase Auth の UUID と一致しているか確認
→ `deleted_at IS NULL` の条件を確認

### メール送信が動かない
→ Resend で送信元ドメインの認証が完了しているか確認
→ `RESEND_FROM_EMAIL` が認証済みドメインのアドレスか確認
