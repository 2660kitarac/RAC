-- ============================================================
-- RAC Cloud - Supabase 完全セットアップSQL
-- このファイルをSupabase SQL Editorで実行してください
-- ============================================================

-- ============================================================
-- STEP 1: 拡張機能
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- STEP 2: テーブル作成
-- ============================================================

CREATE TABLE IF NOT EXISTS districts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  district_number TEXT,
  area_name TEXT,
  fiscal_year_start DATE,
  fiscal_year_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('east', 'west', 'north', 'south', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID REFERENCES districts(id),
  zone_id UUID REFERENCES zones(id),
  name TEXT NOT NULL,
  short_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('RAC', 'RC', 'OB_OG', 'GUEST', 'OTHER')),
  district TEXT,
  area TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  contact_name TEXT,
  memo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system_club BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE,
  club_id UUID REFERENCES clubs(id),
  district_id UUID REFERENCES districts(id),
  zone_id UUID REFERENCES zones(id),
  name TEXT NOT NULL,
  name_kana TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN (
    'system_owner', 'district_admin', 'district_representative',
    'district_secretary', 'district_treasurer', 'district_pr_chair',
    'zone_representative', 'club_admin', 'president', 'secretary',
    'treasurer', 'committee_chair', 'member', 'sponsor_rotarian', 'external'
  )),
  member_type TEXT NOT NULL DEFAULT 'RAC' CHECK (member_type IN ('RAC', 'RC', 'OB_OG', 'GUEST', 'OTHER')),
  position TEXT,
  joined_date DATE,
  resigned_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS district_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID NOT NULL REFERENCES districts(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  term_start DATE,
  term_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  district_id UUID REFERENCES districts(id),
  title TEXT NOT NULL,
  meeting_number INTEGER,
  theme TEXT,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  venue_name TEXT,
  venue_address TEXT,
  committee TEXT,
  manager_user_id UUID REFERENCES users(id),
  description TEXT,
  program_detail TEXT,
  registration_deadline DATE,
  fee_rac INTEGER NOT NULL DEFAULT 0,
  fee_rc INTEGER NOT NULL DEFAULT 0,
  fee_obog INTEGER NOT NULL DEFAULT 0,
  fee_guest INTEGER NOT NULL DEFAULT 0,
  meal_fee INTEGER NOT NULL DEFAULT 0,
  meal_provided BOOLEAN NOT NULL DEFAULT FALSE,
  max_participants INTEGER,
  mu_registration_slug TEXT UNIQUE,
  mu_registration_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'finished', 'cancelled')),
  is_district_event BOOLEAN NOT NULL DEFAULT FALSE,
  is_joint_meeting BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS attendances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id),
  user_id UUID REFERENCES users(id),
  external_name TEXT,
  external_email TEXT,
  external_phone TEXT,
  club_id UUID REFERENCES clubs(id),
  club_name TEXT,
  member_type TEXT NOT NULL DEFAULT 'RAC' CHECK (member_type IN ('RAC', 'RC', 'OB_OG', 'GUEST', 'OTHER')),
  attendance_status TEXT NOT NULL DEFAULT 'undecided' CHECK (attendance_status IN (
    'present', 'absent', 'late', 'early_leave', 'makeup', 'undecided'
  )),
  registration_type TEXT NOT NULL DEFAULT 'mu' CHECK (registration_type IN (
    'member', 'mu', 'rc', 'obog', 'guest'
  )),
  meal_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_meal_required BOOLEAN NOT NULL DEFAULT FALSE,
  fee_amount INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'exempt')),
  payment_method TEXT CHECK (payment_method IN ('cash', 'bank_transfer', 'paypay', 'other')),
  paid_at TIMESTAMPTZ,
  payment_amount INTEGER DEFAULT 0,
  receipt_required BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_name_type TEXT CHECK (receipt_name_type IN ('club', 'personal', 'custom')),
  receipt_name TEXT,
  note TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  district_id UUID REFERENCES districts(id),
  meeting_id UUID REFERENCES meetings(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  category TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  payer_name TEXT,
  payee_name TEXT,
  payment_method TEXT,
  transaction_date DATE NOT NULL,
  description TEXT,
  receipt_id UUID,
  recorded_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS annual_fees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  user_id UUID NOT NULL REFERENCES users(id),
  fiscal_year INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'exempt')),
  payment_method TEXT,
  payment_date DATE,
  paid_at TIMESTAMPTZ,
  memo TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(club_id, user_id, fiscal_year)
);

CREATE TABLE IF NOT EXISTS donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  meeting_id UUID REFERENCES meetings(id),
  donor_name TEXT NOT NULL,
  donor_user_id UUID REFERENCES users(id),
  donor_type TEXT NOT NULL CHECK (donor_type IN ('RC', 'RAC', 'OB_OG', 'GUEST', 'OTHER')),
  amount INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  payment_method TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  meeting_id UUID REFERENCES meetings(id),
  attendance_id UUID REFERENCES attendances(id),
  transaction_id UUID REFERENCES transactions(id),
  receipt_number TEXT NOT NULL UNIQUE,
  receipt_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  issued_date DATE NOT NULL,
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled', 'reissued')),
  issued_by UUID REFERENCES users(id),
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID REFERENCES clubs(id),
  district_id UUID REFERENCES districts(id),
  name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN (
    'meeting_invitation', 'reminder', 'thanks', 'registration_complete',
    'receipt', 'annual_fee_reminder', 'custom'
  )),
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID REFERENCES clubs(id),
  district_id UUID REFERENCES districts(id),
  meeting_id UUID REFERENCES meetings(id),
  template_id UUID REFERENCES email_templates(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  target_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS email_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id UUID NOT NULL REFERENCES emails(id),
  user_id UUID REFERENCES users(id),
  recipient_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  district_id UUID REFERENCES districts(id),
  meeting_id UUID NOT NULL REFERENCES meetings(id) UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  report_body TEXT,
  participants_count INTEGER DEFAULT 0,
  rac_count INTEGER DEFAULT 0,
  rc_count INTEGER DEFAULT 0,
  obog_count INTEGER DEFAULT 0,
  guest_count INTEGER DEFAULT 0,
  income_total INTEGER DEFAULT 0,
  expense_total INTEGER DEFAULT 0,
  balance INTEGER DEFAULT 0,
  ai_prompt TEXT,
  ai_response TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID REFERENCES clubs(id),
  district_id UUID REFERENCES districts(id),
  user_id UUID REFERENCES users(id),
  feature_type TEXT NOT NULL CHECK (feature_type IN (
    'meeting_report', 'invitation_email', 'thanks_message', 'other'
  )),
  prompt TEXT,
  response TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS district_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID NOT NULL REFERENCES districts(id),
  host_club_id UUID REFERENCES clubs(id),
  title TEXT NOT NULL,
  event_type TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  venue_name TEXT,
  venue_address TEXT,
  registration_fee INTEGER DEFAULT 0,
  registration_deadline DATE,
  description TEXT,
  is_award_target BOOLEAN NOT NULL DEFAULT FALSE,
  is_joint_meeting BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS district_event_attendances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_event_id UUID NOT NULL REFERENCES district_events(id),
  club_id UUID REFERENCES clubs(id),
  user_id UUID REFERENCES users(id),
  participant_name TEXT NOT NULL,
  participant_type TEXT,
  attendance_status TEXT NOT NULL DEFAULT 'undecided' CHECK (attendance_status IN (
    'present', 'absent', 'proxy', 'undecided'
  )),
  is_proxy BOOLEAN NOT NULL DEFAULT FALSE,
  proxy_for_user_id UUID REFERENCES users(id),
  fee_amount INTEGER DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'exempt')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS club_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID NOT NULL REFERENCES districts(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  meeting_id UUID REFERENCES meetings(id),
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  submitted_at TIMESTAMPTZ,
  deadline DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  review_comment TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS award_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID NOT NULL REFERENCES districts(id),
  fiscal_year INTEGER NOT NULL,
  award_period_start DATE NOT NULL,
  award_period_end DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(district_id, fiscal_year)
);

CREATE TABLE IF NOT EXISTS award_score_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID NOT NULL REFERENCES districts(id),
  fiscal_year INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  max_score INTEGER,
  calculation_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(district_id, fiscal_year, code)
);

CREATE TABLE IF NOT EXISTS award_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID NOT NULL REFERENCES districts(id),
  fiscal_year INTEGER NOT NULL,
  club_id UUID NOT NULL REFERENCES clubs(id),
  score_item_code TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  evidence_status TEXT NOT NULL DEFAULT 'pending' CHECK (evidence_status IN (
    'pending', 'submitted', 'reviewing', 'approved', 'rejected', 'not_applicable'
  )),
  calculation_detail JSONB,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(district_id, fiscal_year, club_id, score_item_code)
);

CREATE TABLE IF NOT EXISTS award_candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID NOT NULL REFERENCES districts(id),
  fiscal_year INTEGER NOT NULL,
  award_type TEXT NOT NULL CHECK (award_type IN (
    'rookie', 'perfect_attendance', 'makeup', 'rotary_club',
    'growing_club', 'special_pr', 'mvp', 'best_club', 'excellent_club'
  )),
  club_id UUID REFERENCES clubs(id),
  user_id UUID REFERENCES users(id),
  candidate_name TEXT,
  score INTEGER DEFAULT 0,
  rank INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'awarded', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS makeup_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID REFERENCES districts(id),
  visitor_user_id UUID REFERENCES users(id),
  visitor_name TEXT NOT NULL,
  visitor_club_id UUID REFERENCES clubs(id),
  host_club_id UUID REFERENCES clubs(id),
  host_meeting_id UUID REFERENCES meetings(id),
  makeup_date DATE NOT NULL,
  makeup_type TEXT NOT NULL DEFAULT 'rac' CHECK (makeup_type IN ('rac', 'rotary', 'district_event', 'service_project')),
  is_valid_for_attendance BOOLEAN NOT NULL DEFAULT TRUE,
  is_valid_for_award BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS instagram_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID REFERENCES districts(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  meeting_id UUID REFERENCES meetings(id),
  post_type TEXT NOT NULL CHECK (post_type IN ('before', 'after', 'other')),
  post_url TEXT,
  posted_at TIMESTAMPTZ,
  is_feed_post BOOLEAN NOT NULL DEFAULT TRUE,
  score INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'submitted', 'reviewing', 'approved', 'rejected', 'not_applicable'
  )),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS calendar_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID REFERENCES districts(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  meeting_id UUID REFERENCES meetings(id),
  calendar_date DATE,
  is_entered BOOLEAN NOT NULL DEFAULT FALSE,
  has_datetime BOOLEAN NOT NULL DEFAULT FALSE,
  has_venue BOOLEAN NOT NULL DEFAULT FALSE,
  has_theme BOOLEAN NOT NULL DEFAULT FALSE,
  has_content BOOLEAN NOT NULL DEFAULT FALSE,
  has_manager BOOLEAN NOT NULL DEFAULT FALSE,
  has_deadline BOOLEAN NOT NULL DEFAULT FALSE,
  score INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'submitted', 'reviewing', 'approved', 'rejected', 'not_applicable'
  )),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID REFERENCES clubs(id),
  district_id UUID REFERENCES districts(id),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'club', 'district', 'enterprise')),
  monthly_fee INTEGER DEFAULT 0,
  contract_start DATE,
  contract_end DATE,
  max_users INTEGER DEFAULT 10,
  max_clubs INTEGER DEFAULT 1,
  storage_limit_gb INTEGER DEFAULT 1,
  features JSONB DEFAULT '{}',
  stripe_subscription_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- STEP 3: インデックス
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clubs_district_id ON clubs(district_id);
CREATE INDEX IF NOT EXISTS idx_clubs_zone_id ON clubs(zone_id);
CREATE INDEX IF NOT EXISTS idx_users_club_id ON users(club_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_club_id ON meetings(club_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
CREATE INDEX IF NOT EXISTS idx_meetings_slug ON meetings(mu_registration_slug);
CREATE INDEX IF NOT EXISTS idx_attendances_meeting_id ON attendances(meeting_id);
CREATE INDEX IF NOT EXISTS idx_attendances_user_id ON attendances(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_club_id ON transactions(club_id);
CREATE INDEX IF NOT EXISTS idx_transactions_meeting_id ON transactions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_receipts_club_id ON receipts(club_id);

-- ============================================================
-- STEP 4: RLS 有効化
-- ============================================================
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE annual_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 5: トリガー関数
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_districts_updated_at BEFORE UPDATE ON districts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_zones_updated_at BEFORE UPDATE ON zones FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_clubs_updated_at BEFORE UPDATE ON clubs FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_attendances_updated_at BEFORE UPDATE ON attendances FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_annual_fees_updated_at BEFORE UPDATE ON annual_fees FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_receipts_updated_at BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_meeting_reports_updated_at BEFORE UPDATE ON meeting_reports FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ============================================================
-- STEP 6: RLS ポリシー（Helper関数）
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_user_club_id()
RETURNS UUID AS $$
  SELECT club_id FROM users WHERE auth_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE auth_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_user_district_id()
RETURNS UUID AS $$
  SELECT district_id FROM users WHERE auth_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_system_or_district_admin()
RETURNS BOOLEAN AS $$
  SELECT role IN ('system_owner', 'district_admin', 'district_representative', 'district_secretary', 'district_treasurer', 'district_pr_chair', 'zone_representative')
  FROM users
  WHERE auth_user_id = auth.uid() AND deleted_at IS NULL
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================
-- STEP 7: RLS ポリシー
-- ============================================================
DROP POLICY IF EXISTS "clubs_select_policy" ON clubs;
DROP POLICY IF EXISTS "clubs_insert_policy" ON clubs;
DROP POLICY IF EXISTS "clubs_update_policy" ON clubs;
CREATE POLICY "clubs_select_policy" ON clubs FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "clubs_insert_policy" ON clubs FOR INSERT WITH CHECK (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin'));
CREATE POLICY "clubs_update_policy" ON clubs FOR UPDATE USING (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin'));

DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_insert_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;
CREATE POLICY "users_select_policy" ON users FOR SELECT USING (deleted_at IS NULL AND (club_id = get_current_user_club_id() OR is_system_or_district_admin() OR auth_user_id = auth.uid()));
CREATE POLICY "users_insert_policy" ON users FOR INSERT WITH CHECK (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary') OR auth_user_id = auth.uid());
CREATE POLICY "users_update_policy" ON users FOR UPDATE USING (auth_user_id = auth.uid() OR get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin'));

DROP POLICY IF EXISTS "meetings_select_policy" ON meetings;
DROP POLICY IF EXISTS "meetings_insert_policy" ON meetings;
DROP POLICY IF EXISTS "meetings_update_policy" ON meetings;
CREATE POLICY "meetings_select_policy" ON meetings FOR SELECT USING (deleted_at IS NULL AND (club_id = get_current_user_club_id() OR is_system_or_district_admin() OR status IN ('open', 'closed', 'finished')));
CREATE POLICY "meetings_insert_policy" ON meetings FOR INSERT WITH CHECK (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'president'));
CREATE POLICY "meetings_update_policy" ON meetings FOR UPDATE USING (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'president'));

DROP POLICY IF EXISTS "attendances_select_policy" ON attendances;
DROP POLICY IF EXISTS "attendances_insert_policy" ON attendances;
DROP POLICY IF EXISTS "attendances_update_policy" ON attendances;
CREATE POLICY "attendances_select_policy" ON attendances FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "attendances_insert_policy" ON attendances FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "attendances_update_policy" ON attendances FOR UPDATE USING (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'treasurer', 'president'));

DROP POLICY IF EXISTS "transactions_select_policy" ON transactions;
DROP POLICY IF EXISTS "transactions_insert_policy" ON transactions;
DROP POLICY IF EXISTS "transactions_update_policy" ON transactions;
CREATE POLICY "transactions_select_policy" ON transactions FOR SELECT USING (deleted_at IS NULL AND (club_id = get_current_user_club_id() OR is_system_or_district_admin()));
CREATE POLICY "transactions_insert_policy" ON transactions FOR INSERT WITH CHECK (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer', 'secretary', 'president'));
CREATE POLICY "transactions_update_policy" ON transactions FOR UPDATE USING (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer'));

DROP POLICY IF EXISTS "receipts_select_policy" ON receipts;
DROP POLICY IF EXISTS "receipts_insert_policy" ON receipts;
DROP POLICY IF EXISTS "receipts_update_policy" ON receipts;
CREATE POLICY "receipts_select_policy" ON receipts FOR SELECT USING (deleted_at IS NULL AND (club_id = get_current_user_club_id() OR is_system_or_district_admin()));
CREATE POLICY "receipts_insert_policy" ON receipts FOR INSERT WITH CHECK (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer'));
CREATE POLICY "receipts_update_policy" ON receipts FOR UPDATE USING (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer'));

DROP POLICY IF EXISTS "annual_fees_select_policy" ON annual_fees;
DROP POLICY IF EXISTS "annual_fees_insert_policy" ON annual_fees;
DROP POLICY IF EXISTS "annual_fees_update_policy" ON annual_fees;
CREATE POLICY "annual_fees_select_policy" ON annual_fees FOR SELECT USING (deleted_at IS NULL AND (club_id = get_current_user_club_id() OR is_system_or_district_admin()));
CREATE POLICY "annual_fees_insert_policy" ON annual_fees FOR INSERT WITH CHECK (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer'));
CREATE POLICY "annual_fees_update_policy" ON annual_fees FOR UPDATE USING (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer'));

DROP POLICY IF EXISTS "email_templates_select_policy" ON email_templates;
DROP POLICY IF EXISTS "email_templates_insert_policy" ON email_templates;
CREATE POLICY "email_templates_select_policy" ON email_templates FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "email_templates_insert_policy" ON email_templates FOR INSERT WITH CHECK (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary'));

DROP POLICY IF EXISTS "emails_select_policy" ON emails;
DROP POLICY IF EXISTS "emails_insert_policy" ON emails;
CREATE POLICY "emails_select_policy" ON emails FOR SELECT USING (deleted_at IS NULL AND (club_id = get_current_user_club_id() OR is_system_or_district_admin()));
CREATE POLICY "emails_insert_policy" ON emails FOR INSERT WITH CHECK (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'president'));

DROP POLICY IF EXISTS "meeting_reports_select_policy" ON meeting_reports;
DROP POLICY IF EXISTS "meeting_reports_insert_policy" ON meeting_reports;
DROP POLICY IF EXISTS "meeting_reports_update_policy" ON meeting_reports;
CREATE POLICY "meeting_reports_select_policy" ON meeting_reports FOR SELECT USING (deleted_at IS NULL AND (club_id = get_current_user_club_id() OR is_system_or_district_admin()));
CREATE POLICY "meeting_reports_insert_policy" ON meeting_reports FOR INSERT WITH CHECK (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'president', 'committee_chair'));
CREATE POLICY "meeting_reports_update_policy" ON meeting_reports FOR UPDATE USING (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'secretary', 'president'));

DROP POLICY IF EXISTS "ai_logs_select_policy" ON ai_logs;
DROP POLICY IF EXISTS "ai_logs_insert_policy" ON ai_logs;
CREATE POLICY "ai_logs_select_policy" ON ai_logs FOR SELECT USING (is_system_or_district_admin());
CREATE POLICY "ai_logs_insert_policy" ON ai_logs FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "donations_select_policy" ON donations;
DROP POLICY IF EXISTS "donations_insert_policy" ON donations;
CREATE POLICY "donations_select_policy" ON donations FOR SELECT USING (deleted_at IS NULL AND (club_id = get_current_user_club_id() OR is_system_or_district_admin()));
CREATE POLICY "donations_insert_policy" ON donations FOR INSERT WITH CHECK (get_current_user_role() IN ('system_owner', 'district_admin', 'club_admin', 'treasurer', 'secretary', 'president'));

DROP POLICY IF EXISTS "email_recipients_select_policy" ON email_recipients;
DROP POLICY IF EXISTS "email_recipients_insert_policy" ON email_recipients;
CREATE POLICY "email_recipients_select_policy" ON email_recipients FOR SELECT USING (TRUE);
CREATE POLICY "email_recipients_insert_policy" ON email_recipients FOR INSERT WITH CHECK (TRUE);

-- ============================================================
-- STEP 8: 初期データ（地区・ゾーン・クラブ）
-- ============================================================
INSERT INTO districts (id, name, district_number, area_name, fiscal_year_start, fiscal_year_end)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '国際ロータリー第2660地区',
  '2660',
  '大阪府・兵庫県',
  '2025-07-01',
  '2026-06-30'
) ON CONFLICT DO NOTHING;

INSERT INTO zones (id, district_id, name, zone_type)
VALUES
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', '西ゾーン', 'west'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '東ゾーン', 'east')
ON CONFLICT DO NOTHING;

INSERT INTO clubs (id, district_id, zone_id, name, short_name, type, district, area, is_active, is_system_club)
VALUES (
  '33333333-3333-3333-3333-333333333331',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '大阪北ローターアクトクラブ',
  '大阪北RAC',
  'RAC',
  '第2660地区',
  '西ゾーン',
  TRUE,
  TRUE
) ON CONFLICT DO NOTHING;

INSERT INTO clubs (id, district_id, zone_id, name, short_name, type, district, area, is_active)
VALUES (
  '33333333-3333-3333-3333-333333333332',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '大阪北ロータリークラブ',
  '大阪北RC',
  'RC',
  '第2660地区',
  '西ゾーン',
  TRUE
) ON CONFLICT DO NOTHING;

-- ============================================================
