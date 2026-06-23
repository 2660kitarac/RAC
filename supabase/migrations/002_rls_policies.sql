-- RAC Cloud - Row Level Security Policies
-- Version: 002

-- ============================================================
-- Helper function: 現在のユーザーのクラブIDを取得
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_user_club_id()
RETURNS UUID AS $$
  SELECT club_id FROM users WHERE auth_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================
-- Helper function: 現在のユーザーのロールを取得
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE auth_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================
-- Helper function: 現在のユーザーの地区IDを取得
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_user_district_id()
RETURNS UUID AS $$
  SELECT district_id FROM users WHERE auth_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================
-- Helper function: システム管理者・地区管理者かどうかチェック
-- ============================================================
CREATE OR REPLACE FUNCTION is_system_or_district_admin()
RETURNS BOOLEAN AS $$
  SELECT role IN ('system_owner', 'district_admin', 'district_representative', 'district_secretary', 'district_treasurer', 'district_pr_chair', 'zone_representative')
  FROM users 
  WHERE auth_user_id = auth.uid() AND deleted_at IS NULL 
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================
-- CLUBS ポリシー
-- ============================================================
-- 全ユーザーがクラブ一覧を閲覧可能（MU登録フォームのため）
CREATE POLICY "clubs_select_policy" ON clubs
  FOR SELECT
  USING (deleted_at IS NULL);

-- クラブ管理者以上のみ作成・更新可能
CREATE POLICY "clubs_insert_policy" ON clubs
  FOR INSERT
  WITH CHECK (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin')
  );

CREATE POLICY "clubs_update_policy" ON clubs
  FOR UPDATE
  USING (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin')
    AND (id = get_current_user_club_id() OR get_current_user_role() IN ('system_owner', 'district_admin'))
  );

-- ============================================================
-- USERS ポリシー
-- ============================================================
-- 自クラブのユーザーは閲覧可能
CREATE POLICY "users_select_policy" ON users
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      club_id = get_current_user_club_id()
      OR is_system_or_district_admin()
      OR auth_user_id = auth.uid()
    )
  );

CREATE POLICY "users_insert_policy" ON users
  FOR INSERT
  WITH CHECK (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary')
    OR auth_user_id = auth.uid()
  );

CREATE POLICY "users_update_policy" ON users
  FOR UPDATE
  USING (
    auth_user_id = auth.uid()
    OR get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin')
    OR (get_current_user_role() = 'secretary' AND club_id = get_current_user_club_id())
  );

-- ============================================================
-- MEETINGS ポリシー
-- ============================================================
CREATE POLICY "meetings_select_policy" ON meetings
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      club_id = get_current_user_club_id()
      OR is_system_or_district_admin()
      OR status IN ('open', 'closed', 'finished') -- 公開されている例会は閲覧可能
    )
  );

CREATE POLICY "meetings_insert_policy" ON meetings
  FOR INSERT
  WITH CHECK (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'president')
    AND club_id = get_current_user_club_id()
  );

CREATE POLICY "meetings_update_policy" ON meetings
  FOR UPDATE
  USING (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'president')
    AND (club_id = get_current_user_club_id() OR get_current_user_role() IN ('system_owner', 'district_admin'))
  );

-- ============================================================
-- ATTENDANCES ポリシー
-- ============================================================
CREATE POLICY "attendances_select_policy" ON attendances
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.club_id = get_current_user_club_id())
      OR is_system_or_district_admin()
      OR user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- MU登録は誰でも挿入可能（外部フォームから）
CREATE POLICY "attendances_insert_policy" ON attendances
  FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "attendances_update_policy" ON attendances
  FOR UPDATE
  USING (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'treasurer', 'president')
    OR EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.club_id = get_current_user_club_id())
  );

-- ============================================================
-- TRANSACTIONS ポリシー
-- ============================================================
CREATE POLICY "transactions_select_policy" ON transactions
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      club_id = get_current_user_club_id()
      OR is_system_or_district_admin()
    )
  );

CREATE POLICY "transactions_insert_policy" ON transactions
  FOR INSERT
  WITH CHECK (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer', 'secretary', 'president')
    AND club_id = get_current_user_club_id()
  );

CREATE POLICY "transactions_update_policy" ON transactions
  FOR UPDATE
  USING (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer')
    AND (club_id = get_current_user_club_id() OR get_current_user_role() IN ('system_owner', 'district_admin'))
  );

-- ============================================================
-- RECEIPTS ポリシー
-- ============================================================
CREATE POLICY "receipts_select_policy" ON receipts
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      club_id = get_current_user_club_id()
      OR is_system_or_district_admin()
    )
  );

CREATE POLICY "receipts_insert_policy" ON receipts
  FOR INSERT
  WITH CHECK (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer')
    AND club_id = get_current_user_club_id()
  );

-- 領収書は発行後変更不可（キャンセルのみ）
CREATE POLICY "receipts_update_policy" ON receipts
  FOR UPDATE
  USING (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer')
    AND status = 'issued' -- 発行済みのみ更新可能（キャンセル用）
  );

-- ============================================================
-- ANNUAL_FEES ポリシー
-- ============================================================
CREATE POLICY "annual_fees_select_policy" ON annual_fees
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      club_id = get_current_user_club_id()
      OR is_system_or_district_admin()
    )
  );

CREATE POLICY "annual_fees_insert_policy" ON annual_fees
  FOR INSERT
  WITH CHECK (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer')
    AND club_id = get_current_user_club_id()
  );

CREATE POLICY "annual_fees_update_policy" ON annual_fees
  FOR UPDATE
  USING (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer')
    AND (club_id = get_current_user_club_id() OR get_current_user_role() IN ('system_owner', 'district_admin'))
  );

-- ============================================================
-- EMAIL_TEMPLATES ポリシー
-- ============================================================
CREATE POLICY "email_templates_select_policy" ON email_templates
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      club_id = get_current_user_club_id()
      OR is_system_or_district_admin()
      OR club_id IS NULL -- システム共通テンプレート
    )
  );

CREATE POLICY "email_templates_insert_policy" ON email_templates
  FOR INSERT
  WITH CHECK (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary')
  );

-- ============================================================
-- EMAILS ポリシー
-- ============================================================
CREATE POLICY "emails_select_policy" ON emails
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      club_id = get_current_user_club_id()
      OR is_system_or_district_admin()
    )
  );

CREATE POLICY "emails_insert_policy" ON emails
  FOR INSERT
  WITH CHECK (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'president')
  );

-- ============================================================
-- MEETING_REPORTS ポリシー
-- ============================================================
CREATE POLICY "meeting_reports_select_policy" ON meeting_reports
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      club_id = get_current_user_club_id()
      OR is_system_or_district_admin()
    )
  );

CREATE POLICY "meeting_reports_insert_policy" ON meeting_reports
  FOR INSERT
  WITH CHECK (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'president', 'committee_chair')
    AND club_id = get_current_user_club_id()
  );

CREATE POLICY "meeting_reports_update_policy" ON meeting_reports
  FOR UPDATE
  USING (
    get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'president')
    AND (club_id = get_current_user_club_id() OR get_current_user_role() IN ('system_owner', 'district_admin'))
  );
