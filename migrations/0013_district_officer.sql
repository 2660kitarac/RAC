-- ============================================================
-- 地区役員向け機能
--  - 地区からのお知らせ（district_announcements）を新設
--  - 報告書・Instagram 審査で使う club_reports / instagram_posts を
--    まだ無い環境向けに作成（既にあれば何もしない）
--  既存テーブルの列は変更しない。何度実行しても問題ない。
-- ============================================================

CREATE TABLE IF NOT EXISTS district_announcements (
  id             TEXT PRIMARY KEY,
  district_id    TEXT NOT NULL REFERENCES districts(id),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL DEFAULT '',
  level          TEXT NOT NULL DEFAULT 'info',      -- info / important / urgent
  audience       TEXT NOT NULL DEFAULT 'all',       -- all（全会員） / officers（クラブ役員・アカウントのみ）
  link_url       TEXT,
  link_label     TEXT,
  publish_from   TEXT,                              -- YYYY-MM-DD（空なら即日）
  publish_until  TEXT,                              -- YYYY-MM-DD（空なら無期限）
  pinned         BOOLEAN NOT NULL DEFAULT false,
  created_by     TEXT,
  updated_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  updated_at     TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  deleted_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_district_announcements_district ON district_announcements(district_id);

CREATE TABLE IF NOT EXISTS club_reports (
  id                TEXT PRIMARY KEY,
  district_id       TEXT REFERENCES districts(id),
  club_id           TEXT NOT NULL REFERENCES clubs(id),
  meeting_id        TEXT REFERENCES meetings(id),
  title             TEXT NOT NULL,
  report_type       TEXT NOT NULL DEFAULT 'meeting',
  status            TEXT NOT NULL DEFAULT 'draft',
  deadline          TEXT,
  submitted_at      TEXT,
  approved_at       TEXT,
  rejected_at       TEXT,
  rejection_reason  TEXT,
  content           TEXT,
  submitted_by      TEXT REFERENCES users(id),
  reviewed_by       TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  updated_at        TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  deleted_at        TEXT
);

CREATE TABLE IF NOT EXISTS instagram_posts (
  id                TEXT PRIMARY KEY,
  district_id       TEXT REFERENCES districts(id),
  club_id           TEXT NOT NULL REFERENCES clubs(id),
  meeting_id        TEXT REFERENCES meetings(id),
  post_type         TEXT NOT NULL DEFAULT 'after',
  post_url          TEXT,
  caption           TEXT,
  image_url         TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  score             INTEGER NOT NULL DEFAULT 0,
  reviewed_by       TEXT REFERENCES users(id),
  reviewed_at       TEXT,
  rejection_reason  TEXT,
  submitted_by      TEXT REFERENCES users(id),
  submitted_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  updated_at        TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  deleted_at        TEXT
);

ALTER TABLE district_announcements ENABLE ROW LEVEL SECURITY;
