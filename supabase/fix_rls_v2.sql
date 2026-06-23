-- ============================================================
-- RLS ポリシー完全修正 v2
-- 問題: system_owner でも自分のプロフィールが取得できない
-- 原因: ポリシーの循環参照 & users テーブルの自己参照問題
-- ============================================================

-- ============================================================
-- Step 1: ヘルパー関数を SECURITY DEFINER で再作成
-- （RLS をバイパスして users テーブルを直接参照）
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_user_club_id()
RETURNS UUID AS $$
  SELECT club_id FROM users WHERE auth_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE auth_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_current_user_district_id()
RETURNS UUID AS $$
  SELECT district_id FROM users WHERE auth_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_system_or_district_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('system_owner', 'district_admin', 'district_representative', 'district_secretary', 'district_treasurer', 'district_pr_chair', 'zone_representative')
     FROM users 
     WHERE auth_user_id = auth.uid() AND deleted_at IS NULL 
     LIMIT 1),
    FALSE
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- Step 2: USERS テーブルのポリシーを完全リセット
-- 最重要: 自分自身のレコードは必ず取得できるようにする
-- ============================================================

-- 既存ポリシーを全削除
DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_self_select_policy" ON users;
DROP POLICY IF EXISTS "users_insert_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;
DROP POLICY IF EXISTS "users_delete_policy" ON users;

-- SELECT: 自分自身 OR 同クラブ OR 管理者
-- 注意: 「自分自身」の条件を最初に置き、ヘルパー関数の循環を避ける
CREATE POLICY "users_select_policy" ON users
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      -- 自分自身のレコードは常に見える（最優先・循環なし）
      auth_user_id = auth.uid()
      -- 同じクラブのメンバー
      OR club_id = get_current_user_club_id()
      -- システム管理者・地区管理者
      OR is_system_or_district_admin()
    )
  );

-- INSERT: 自分自身 OR 管理者
CREATE POLICY "users_insert_policy" ON users
  FOR INSERT
  WITH CHECK (
    auth_user_id = auth.uid()
    OR get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary')
  );

-- UPDATE: 自分自身 OR 管理者
CREATE POLICY "users_update_policy" ON users
  FOR UPDATE
  USING (
    auth_user_id = auth.uid()
    OR get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin')
    OR (get_current_user_role() = 'secretary' AND club_id = get_current_user_club_id())
  );

-- ============================================================
-- Step 3: 他テーブルのポリシーをリセット（データアクセス保証）
-- ============================================================

-- CLUBS
DROP POLICY IF EXISTS "clubs_select_policy" ON clubs;
CREATE POLICY "clubs_select_policy" ON clubs
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "clubs_insert_policy" ON clubs;
CREATE POLICY "clubs_insert_policy" ON clubs
  FOR INSERT
  WITH CHECK (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin')
  );

DROP POLICY IF EXISTS "clubs_update_policy" ON clubs;
CREATE POLICY "clubs_update_policy" ON clubs
  FOR UPDATE
  USING (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin')
  );

-- MEETINGS
DROP POLICY IF EXISTS "meetings_select_policy" ON meetings;
CREATE POLICY "meetings_select_policy" ON meetings
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "meetings_insert_policy" ON meetings;
CREATE POLICY "meetings_insert_policy" ON meetings
  FOR INSERT
  WITH CHECK (
    club_id = get_current_user_club_id()
    OR is_system_or_district_admin()
  );

DROP POLICY IF EXISTS "meetings_update_policy" ON meetings;
CREATE POLICY "meetings_update_policy" ON meetings
  FOR UPDATE
  USING (
    club_id = get_current_user_club_id()
    OR is_system_or_district_admin()
  );

-- ATTENDANCES
DROP POLICY IF EXISTS "attendances_select_policy" ON attendances;
CREATE POLICY "attendances_select_policy" ON attendances
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "attendances_insert_policy" ON attendances;
CREATE POLICY "attendances_insert_policy" ON attendances
  FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "attendances_update_policy" ON attendances;
CREATE POLICY "attendances_update_policy" ON attendances
  FOR UPDATE
  USING (TRUE);

-- TRANSACTIONS
DROP POLICY IF EXISTS "transactions_select_policy" ON transactions;
CREATE POLICY "transactions_select_policy" ON transactions
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "transactions_insert_policy" ON transactions;
CREATE POLICY "transactions_insert_policy" ON transactions
  FOR INSERT
  WITH CHECK (
    club_id = get_current_user_club_id()
    OR is_system_or_district_admin()
  );

DROP POLICY IF EXISTS "transactions_update_policy" ON transactions;
CREATE POLICY "transactions_update_policy" ON transactions
  FOR UPDATE
  USING (
    club_id = get_current_user_club_id()
    OR is_system_or_district_admin()
  );

-- ANNUAL_FEES
DROP POLICY IF EXISTS "annual_fees_select_policy" ON annual_fees;
CREATE POLICY "annual_fees_select_policy" ON annual_fees
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "annual_fees_insert_policy" ON annual_fees;
CREATE POLICY "annual_fees_insert_policy" ON annual_fees
  FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "annual_fees_update_policy" ON annual_fees;
CREATE POLICY "annual_fees_update_policy" ON annual_fees
  FOR UPDATE
  USING (TRUE);

-- RECEIPTS
DROP POLICY IF EXISTS "receipts_select_policy" ON receipts;
CREATE POLICY "receipts_select_policy" ON receipts
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "receipts_insert_policy" ON receipts;
CREATE POLICY "receipts_insert_policy" ON receipts
  FOR INSERT
  WITH CHECK (
    club_id = get_current_user_club_id()
    OR is_system_or_district_admin()
  );

DROP POLICY IF EXISTS "receipts_update_policy" ON receipts;
CREATE POLICY "receipts_update_policy" ON receipts
  FOR UPDATE
  USING (
    club_id = get_current_user_club_id()
    OR is_system_or_district_admin()
  );

-- EMAIL_TEMPLATES
DROP POLICY IF EXISTS "email_templates_select_policy" ON email_templates;
CREATE POLICY "email_templates_select_policy" ON email_templates
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "email_templates_insert_policy" ON email_templates;
CREATE POLICY "email_templates_insert_policy" ON email_templates
  FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "email_templates_update_policy" ON email_templates;
CREATE POLICY "email_templates_update_policy" ON email_templates
  FOR UPDATE
  USING (TRUE);

-- EMAILS
DROP POLICY IF EXISTS "emails_select_policy" ON emails;
CREATE POLICY "emails_select_policy" ON emails
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "emails_insert_policy" ON emails;
CREATE POLICY "emails_insert_policy" ON emails
  FOR INSERT
  WITH CHECK (TRUE);

-- MEETING_REPORTS
DROP POLICY IF EXISTS "meeting_reports_select_policy" ON meeting_reports;
CREATE POLICY "meeting_reports_select_policy" ON meeting_reports
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "meeting_reports_insert_policy" ON meeting_reports;
CREATE POLICY "meeting_reports_insert_policy" ON meeting_reports
  FOR INSERT
  WITH CHECK (
    club_id = get_current_user_club_id()
    OR is_system_or_district_admin()
  );

DROP POLICY IF EXISTS "meeting_reports_update_policy" ON meeting_reports;
CREATE POLICY "meeting_reports_update_policy" ON meeting_reports
  FOR UPDATE
  USING (
    club_id = get_current_user_club_id()
    OR is_system_or_district_admin()
  );

-- DONATIONS
DROP POLICY IF EXISTS "donations_select_policy" ON donations;
CREATE POLICY "donations_select_policy" ON donations
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "donations_insert_policy" ON donations;
CREATE POLICY "donations_insert_policy" ON donations
  FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "donations_update_policy" ON donations;
CREATE POLICY "donations_update_policy" ON donations
  FOR UPDATE
  USING (TRUE);

-- AI_LOGS
DROP POLICY IF EXISTS "ai_logs_select_policy" ON ai_logs;
CREATE POLICY "ai_logs_select_policy" ON ai_logs
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "ai_logs_insert_policy" ON ai_logs;
CREATE POLICY "ai_logs_insert_policy" ON ai_logs
  FOR INSERT
  WITH CHECK (TRUE);

-- EMAIL_RECIPIENTS
DROP POLICY IF EXISTS "email_recipients_select_policy" ON email_recipients;
CREATE POLICY "email_recipients_select_policy" ON email_recipients
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "email_recipients_insert_policy" ON email_recipients;
CREATE POLICY "email_recipients_insert_policy" ON email_recipients
  FOR INSERT
  WITH CHECK (TRUE);

-- ZONES (存在する場合)
DROP POLICY IF EXISTS "zones_select_policy" ON zones;
CREATE POLICY "zones_select_policy" ON zones
  FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "zones_insert_policy" ON zones;
CREATE POLICY "zones_insert_policy" ON zones
  FOR INSERT
  WITH CHECK (is_system_or_district_admin());

DROP POLICY IF EXISTS "zones_update_policy" ON zones;
CREATE POLICY "zones_update_policy" ON zones
  FOR UPDATE
  USING (is_system_or_district_admin());

-- DISTRICTS (存在する場合)
DROP POLICY IF EXISTS "districts_select_policy" ON districts;
CREATE POLICY "districts_select_policy" ON districts
  FOR SELECT
  USING (deleted_at IS NULL);

-- ============================================================
-- Step 4: system_owner の users テーブルレコードを確認・修正
-- auth_user_id が正しく設定されているか確認
-- ============================================================

-- 確認用クエリ（実行結果を確認してください）
SELECT id, auth_user_id, name, email, role, club_id, district_id, deleted_at
FROM users
WHERE role = 'system_owner';
