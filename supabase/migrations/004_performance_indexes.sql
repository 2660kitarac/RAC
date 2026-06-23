-- ============================================================
-- パフォーマンス改善: 複合インデックス追加
-- 500人規模対応
-- ============================================================

-- deleted_at は全テーブルで毎回 IS NULL フィルタされる
-- → 部分インデックス（WHERE deleted_at IS NULL）で有効レコードのみ対象にする

-- users テーブル
CREATE INDEX IF NOT EXISTS idx_users_club_id_active
  ON users(club_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id_active
  ON users(auth_user_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_role_active
  ON users(role) WHERE deleted_at IS NULL;

-- meetings テーブル
CREATE INDEX IF NOT EXISTS idx_meetings_club_id_active
  ON meetings(club_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_club_date_active
  ON meetings(club_id, date DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_status_active
  ON meetings(status) WHERE deleted_at IS NULL;

-- attendances テーブル（出席は件数が多くなりやすい）
CREATE INDEX IF NOT EXISTS idx_attendances_meeting_id_active
  ON attendances(meeting_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendances_club_id_active
  ON attendances(club_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendances_user_id_active
  ON attendances(user_id) WHERE deleted_at IS NULL;

-- transactions テーブル
CREATE INDEX IF NOT EXISTS idx_transactions_club_date_active
  ON transactions(club_id, transaction_date DESC) WHERE deleted_at IS NULL;

-- annual_fees テーブル
CREATE INDEX IF NOT EXISTS idx_annual_fees_club_year_active
  ON annual_fees(club_id, fiscal_year) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_annual_fees_payment_status
  ON annual_fees(payment_status) WHERE deleted_at IS NULL;

-- receipts テーブル
CREATE INDEX IF NOT EXISTS idx_receipts_club_id_active
  ON receipts(club_id) WHERE deleted_at IS NULL;

-- emails テーブル
CREATE INDEX IF NOT EXISTS idx_emails_club_id_active
  ON emails(club_id) WHERE deleted_at IS NULL;

-- meeting_reports テーブル
CREATE INDEX IF NOT EXISTS idx_meeting_reports_club_id_active
  ON meeting_reports(club_id) WHERE deleted_at IS NULL;

-- clubs テーブル
CREATE INDEX IF NOT EXISTS idx_clubs_district_id_active
  ON clubs(district_id) WHERE deleted_at IS NULL;
