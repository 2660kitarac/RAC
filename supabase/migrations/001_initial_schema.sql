-- RAC Cloud - Initial Database Schema
-- Version: 001
-- Description: Complete schema for RAC Cloud SaaS

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- DISTRICTS テーブル
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

-- ============================================================
-- ZONES テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('east', 'west', 'north', 'south', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================
-- CLUBS テーブル
-- ============================================================
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

-- ============================================================
-- USERS テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE, -- Supabase auth.users への参照
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

-- ============================================================
-- DISTRICT_ROLES テーブル
-- ============================================================
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

-- ============================================================
-- MEETINGS テーブル
-- ============================================================
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

-- ============================================================
-- ATTENDANCES テーブル
-- ============================================================
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
  fee_amount INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'exempt')),
  payment_method TEXT CHECK (payment_method IN ('cash', 'bank_transfer', 'paypay', 'other')),
  paid_at TIMESTAMPTZ,
  receipt_required BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_name_type TEXT CHECK (receipt_name_type IN ('club', 'personal', 'custom')),
  receipt_name TEXT,
  note TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================
-- TRANSACTIONS テーブル
-- ============================================================
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
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================
-- ANNUAL_FEES テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS annual_fees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  user_id UUID NOT NULL REFERENCES users(id),
  fiscal_year INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'exempt')),
  payment_method TEXT,
  paid_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(club_id, user_id, fiscal_year)
);

-- ============================================================
-- DONATIONS (ニコニコ) テーブル
-- ============================================================
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

-- ============================================================
-- RECEIPTS テーブル
-- ============================================================
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

-- ============================================================
-- EMAIL_TEMPLATES テーブル
-- ============================================================
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

-- ============================================================
-- EMAILS テーブル
-- ============================================================
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

-- ============================================================
-- EMAIL_RECIPIENTS テーブル
-- ============================================================
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

-- ============================================================
-- MEETING_REPORTS テーブル
-- ============================================================
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

-- ============================================================
-- AI_LOGS テーブル
-- ============================================================
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

-- ============================================================
-- DISTRICT_EVENTS テーブル
-- ============================================================
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

-- ============================================================
-- DISTRICT_EVENT_ATTENDANCES テーブル
-- ============================================================
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

-- ============================================================
-- CLUB_REPORTS テーブル
-- ============================================================
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

-- ============================================================
-- AWARD_SETTINGS テーブル
-- ============================================================
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

-- ============================================================
-- AWARD_SCORE_ITEMS テーブル
-- ============================================================
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

-- ============================================================
-- AWARD_SCORES テーブル
-- ============================================================
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

-- ============================================================
-- AWARD_CANDIDATES テーブル
-- ============================================================
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

-- ============================================================
-- MAKEUP_RECORDS テーブル
-- ============================================================
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

-- ============================================================
-- INSTAGRAM_POSTS テーブル
-- ============================================================
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

-- ============================================================
-- CALENDAR_ENTRIES テーブル
-- ============================================================
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

-- ============================================================
-- CLUB_MEMBERSHIP_SNAPSHOTS テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS club_membership_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID REFERENCES districts(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  fiscal_year INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  my_rotary_member_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AWARD_EVIDENCES テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS award_evidences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id UUID REFERENCES districts(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  award_score_id UUID REFERENCES award_scores(id),
  evidence_type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  file_url TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'submitted', 'reviewing', 'approved', 'rejected', 'not_applicable'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================
-- SaaS SUBSCRIPTIONS テーブル
-- ============================================================
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
-- インデックス
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
CREATE INDEX IF NOT EXISTS idx_award_scores_club_id ON award_scores(club_id);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_club_id ON instagram_posts(club_id);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_club_id ON calendar_entries(club_id);

-- ============================================================
-- Row Level Security (RLS)
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
-- Updated_at 自動更新トリガー
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
CREATE TRIGGER update_award_scores_updated_at BEFORE UPDATE ON award_scores FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
