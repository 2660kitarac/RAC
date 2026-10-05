-- ============================================================
-- 地区行事の申込（登録）フォーム
--  - 地区役員が行事ごとに申込フォームを作り、URLを各クラブ・他地区へ配る
--  - 申込はログイン不要。申込後に発行される修正用リンクで締切まで修正できる
--  - 集計・入金確認は地区役員（複数人）がログインして行う
--  既存テーブルには手を入れない。
-- ============================================================

CREATE TABLE IF NOT EXISTS registration_forms (
  id                 TEXT PRIMARY KEY,
  district_id        TEXT NOT NULL REFERENCES districts(id),
  district_event_id  TEXT REFERENCES district_events(id),
  slug               TEXT NOT NULL UNIQUE,      -- 申込URL /entry/<slug>
  config             JSONB NOT NULL DEFAULT '{}'::jsonb,  -- src/lib/event-registration/types.ts の RegistrationFormConfig
  created_by         TEXT,
  updated_by         TEXT,
  created_at         TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  updated_at         TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  deleted_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_registration_forms_district ON registration_forms(district_id);

CREATE TABLE IF NOT EXISTS event_registrations (
  id                 TEXT PRIMARY KEY,
  form_id            TEXT NOT NULL REFERENCES registration_forms(id),
  edit_token         TEXT NOT NULL UNIQUE,      -- 修正用リンクの鍵（推測できない長さ）
  district_name      TEXT,
  club_id            TEXT REFERENCES clubs(id),
  club_name          TEXT NOT NULL,
  registrant_name    TEXT NOT NULL,
  registrant_email   TEXT NOT NULL,
  registrant_phone   TEXT,
  data               JSONB NOT NULL DEFAULT '{}'::jsonb,  -- RegistrationInput（参加者・物販など）
  attendee_count     INTEGER NOT NULL DEFAULT 0,
  registration_fee   INTEGER NOT NULL DEFAULT 0,
  items_fee          INTEGER NOT NULL DEFAULT 0,
  total_amount       INTEGER NOT NULL DEFAULT 0,
  payment_status     TEXT NOT NULL DEFAULT 'unpaid', -- unpaid / partial / paid
  paid_amount        INTEGER NOT NULL DEFAULT 0,
  paid_at            TEXT,
  payment_note       TEXT,
  admin_note         TEXT,
  status             TEXT NOT NULL DEFAULT 'submitted', -- submitted / cancelled
  submitted_at       TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  updated_at         TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text),
  deleted_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_event_registrations_form ON event_registrations(form_id);

-- 誰がいつ何をしたか（担当が替わっても経緯を追えるように）
CREATE TABLE IF NOT EXISTS event_registration_logs (
  id               TEXT PRIMARY KEY,
  form_id          TEXT NOT NULL REFERENCES registration_forms(id),
  registration_id  TEXT REFERENCES event_registrations(id),
  action           TEXT NOT NULL,   -- created / updated / cancelled / payment / admin_edit / form_updated
  actor            TEXT,            -- 申込者名 or 地区役員の氏名
  detail           TEXT,
  created_at       TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::text)
);
CREATE INDEX IF NOT EXISTS idx_event_registration_logs_form ON event_registration_logs(form_id);

-- Supabase の公開API（anonキー）からは読めないようにする（アプリは直接接続で読み書き）
ALTER TABLE registration_forms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registration_logs ENABLE ROW LEVEL SECURITY;

-- 同じクラブの申込は1件まで（取り消し済み・削除済みは除く）。二重送信・同時申込を防ぐ
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_registrations_club
  ON event_registrations(form_id, club_id)
  WHERE club_id IS NOT NULL AND status <> 'cancelled' AND deleted_at IS NULL;
