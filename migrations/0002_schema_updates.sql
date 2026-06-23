-- RAC Cloud D1 Migration: 0002_schema_updates
-- スキーマの差分補完・カラム追加
-- NOTE: SQLite は ADD COLUMN IF NOT EXISTS をサポートしないため、
--       0001 に既に存在するカラムは除外し、差分のみ追加する

-- districts テーブルにカラム追加（0001 には存在しない）
ALTER TABLE districts ADD COLUMN district_number TEXT;
ALTER TABLE districts ADD COLUMN area_name TEXT;
ALTER TABLE districts ADD COLUMN fiscal_year_start TEXT;
ALTER TABLE districts ADD COLUMN fiscal_year_end TEXT;
ALTER TABLE districts ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE districts ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

-- clubs テーブルにカラム追加（0001 には存在しない）
ALTER TABLE clubs ADD COLUMN is_system_club INTEGER NOT NULL DEFAULT 0;

-- users テーブルにカラム追加（0001 には存在しない）
ALTER TABLE users ADD COLUMN zone_id TEXT;
ALTER TABLE users ADD COLUMN memo TEXT;
ALTER TABLE users ADD COLUMN resigned_at TEXT;

-- meetings テーブルにカラム追加（0001 には存在しない）
ALTER TABLE meetings ADD COLUMN location TEXT;
ALTER TABLE meetings ADD COLUMN note TEXT;
ALTER TABLE meetings ADD COLUMN is_district_event INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meetings ADD COLUMN is_joint_meeting INTEGER NOT NULL DEFAULT 0;

-- email_templates テーブルにカラム追加（0001 には template_type のみ存在）
ALTER TABLE email_templates ADD COLUMN district_id TEXT;
ALTER TABLE email_templates ADD COLUMN subject_template TEXT;
ALTER TABLE email_templates ADD COLUMN body_template TEXT;
ALTER TABLE email_templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

-- emails テーブルにカラム追加（0001 には存在しない）
ALTER TABLE emails ADD COLUMN district_id TEXT;

-- meeting_reports テーブルにカラム追加（0001 には存在しない）
ALTER TABLE meeting_reports ADD COLUMN district_id TEXT;
ALTER TABLE meeting_reports ADD COLUMN ai_prompt TEXT;
ALTER TABLE meeting_reports ADD COLUMN ai_response TEXT;

-- transactions テーブルにカラム追加（0001 には存在しない）
ALTER TABLE transactions ADD COLUMN district_id TEXT;

-- インデックス追加（0001 と重複しないものだけ）
CREATE INDEX IF NOT EXISTS idx_attendances_external_email ON attendances(external_email);
CREATE INDEX IF NOT EXISTS idx_annual_fees_club_id ON annual_fees(club_id);
CREATE INDEX IF NOT EXISTS idx_emails_club_id ON emails(club_id);
CREATE INDEX IF NOT EXISTS idx_clubs_slug ON clubs(slug);
CREATE INDEX IF NOT EXISTS idx_clubs_district_id ON clubs(district_id);
