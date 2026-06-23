-- ============================================================
-- RLS ポリシー修正
-- system_owner は全データにアクセスできるようにする
-- ============================================================

-- users テーブルのポリシーを修正
DROP POLICY IF EXISTS "users_select_policy" ON users;
CREATE POLICY "users_select_policy" ON users
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      auth_user_id = auth.uid()
      OR club_id = get_current_user_club_id()
      OR is_system_or_district_admin()
    )
  );

-- users テーブル：自分自身のレコードは必ず取得できるようにする
DROP POLICY IF EXISTS "users_self_select_policy" ON users;
CREATE POLICY "users_self_select_policy" ON users
  FOR SELECT
  USING (auth_user_id = auth.uid());

-- clubs テーブルのポリシーを修正（全員が見れるように）
DROP POLICY IF EXISTS "clubs_select_policy" ON clubs;
CREATE POLICY "clubs_select_policy" ON clubs
  FOR SELECT
  USING (deleted_at IS NULL);

-- meetings テーブルのポリシーを修正
DROP POLICY IF EXISTS "meetings_select_policy" ON meetings;
CREATE POLICY "meetings_select_policy" ON meetings
  FOR SELECT
  USING (deleted_at IS NULL);

-- attendances テーブル
DROP POLICY IF EXISTS "attendances_select_policy" ON attendances;
CREATE POLICY "attendances_select_policy" ON attendances
  FOR SELECT
  USING (deleted_at IS NULL);

-- transactions テーブル
DROP POLICY IF EXISTS "transactions_select_policy" ON transactions;
CREATE POLICY "transactions_select_policy" ON transactions
  FOR SELECT
  USING (deleted_at IS NULL);

-- annual_fees テーブル
DROP POLICY IF EXISTS "annual_fees_select_policy" ON annual_fees;
CREATE POLICY "annual_fees_select_policy" ON annual_fees
  FOR SELECT
  USING (deleted_at IS NULL);

-- receipts テーブル
DROP POLICY IF EXISTS "receipts_select_policy" ON receipts;
CREATE POLICY "receipts_select_policy" ON receipts
  FOR SELECT
  USING (deleted_at IS NULL);

-- email_templates テーブル
DROP POLICY IF EXISTS "email_templates_select_policy" ON email_templates;
CREATE POLICY "email_templates_select_policy" ON email_templates
  FOR SELECT
  USING (deleted_at IS NULL);

-- emails テーブル
DROP POLICY IF EXISTS "emails_select_policy" ON emails;
CREATE POLICY "emails_select_policy" ON emails
  FOR SELECT
  USING (deleted_at IS NULL);

-- meeting_reports テーブル
DROP POLICY IF EXISTS "meeting_reports_select_policy" ON meeting_reports;
CREATE POLICY "meeting_reports_select_policy" ON meeting_reports
  FOR SELECT
  USING (deleted_at IS NULL);

-- donations テーブル
DROP POLICY IF EXISTS "donations_select_policy" ON donations;
CREATE POLICY "donations_select_policy" ON donations
  FOR SELECT
  USING (deleted_at IS NULL);

-- ai_logs テーブル
DROP POLICY IF EXISTS "ai_logs_select_policy" ON ai_logs;
CREATE POLICY "ai_logs_select_policy" ON ai_logs
  FOR SELECT
  USING (TRUE);

-- email_recipients テーブル
DROP POLICY IF EXISTS "email_recipients_select_policy" ON email_recipients;
CREATE POLICY "email_recipients_select_policy" ON email_recipients
  FOR SELECT
  USING (TRUE);
