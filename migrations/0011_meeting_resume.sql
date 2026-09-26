-- ============================================================
-- 例会レジュメ機能
--  - 既存テーブルには手を入れず、新しい3テーブルだけを追加する
--    （適用前にアプリが先に動いても、既存画面は壊れない）
-- ============================================================

-- クラブ共通のレジュメ設定（ヘッダー表記・提唱クラブ・ロゴ・国歌/ソング本文）
CREATE TABLE IF NOT EXISTS club_resume_settings (
  club_id       TEXT PRIMARY KEY REFERENCES clubs(id),
  header_label  TEXT,          -- 例: 国際ロータリー第2660地区ローターアクト
  sponsor_name  TEXT,          -- 例: 大阪北ロータリークラブ
  logo_url      TEXT,          -- 右上に出すロゴ（data URL）
  anthem_title  TEXT,          -- 例: 君が代
  anthem_text   TEXT,
  song_title    TEXT,          -- 例: ローターアクトソング
  song_text     TEXT,
  created_at    TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  updated_at    TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text)
);

-- 会員名簿用のプロフィール（写真・ローマ字・委員会・勤務先）
CREATE TABLE IF NOT EXISTS member_resume_profiles (
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  club_id     TEXT NOT NULL REFERENCES clubs(id),
  name_en     TEXT,            -- 例: Furukawa Hironobu
  committee   TEXT,            -- 例: AI導入委員長
  company     TEXT,            -- 空欄なら users.occupation を使う
  photo_url   TEXT,            -- 顔写真（data URL・縮小済み）
  created_at  TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  updated_at  TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text)
);
CREATE INDEX IF NOT EXISTS idx_member_resume_profiles_club ON member_resume_profiles(club_id);

-- 例会ごとのレジュメ内容（プログラム・ビジター調整・幹事連絡など）
CREATE TABLE IF NOT EXISTS meeting_resumes (
  meeting_id  TEXT PRIMARY KEY REFERENCES meetings(id),
  club_id     TEXT NOT NULL REFERENCES clubs(id),
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  updated_at  TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text)
);
CREATE INDEX IF NOT EXISTS idx_meeting_resumes_club ON meeting_resumes(club_id);

-- Supabase の公開API（anonキー）からは読めないようにする。
-- アプリは DATABASE_URL の直接接続（テーブル所有者）で読み書きするため影響しない。
ALTER TABLE club_resume_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_resume_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_resumes        ENABLE ROW LEVEL SECURITY;
