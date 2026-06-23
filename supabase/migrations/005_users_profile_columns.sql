-- Migration 005: usersテーブルにプロフィール項目追加・clubsにslug追加
-- 会員登録・個人スマホ画面で使用する項目

-- ============================================================
-- clubsテーブルにslugカラムを追加（個人スマホ画面のURL用）
-- ============================================================
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_clubs_slug ON clubs(slug);

-- ============================================================
-- usersテーブルにプロフィール項目を追加
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS address_zip TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT,        -- 会社・学校名（任意）
  ADD COLUMN IF NOT EXISTS allergy TEXT,           -- 食物アレルギー
  ADD COLUMN IF NOT EXISTS dietary_note TEXT,      -- 食事に関するその他注意事項
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,   -- 緊急連絡先氏名
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,  -- 緊急連絡先電話番号
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;        -- プロフィール画像URL

-- インデックス（生年月日は年齢層分析等に使う可能性あり）
CREATE INDEX IF NOT EXISTS idx_users_birth_date ON users(birth_date);
