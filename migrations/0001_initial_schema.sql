-- RAC Cloud D1 Migration: 0001_initial_schema
-- Auth.js + Drizzle ORM 対応スキーマ

CREATE TABLE IF NOT EXISTS districts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  district_id TEXT REFERENCES districts(id),
  zone_id TEXT,
  name TEXT NOT NULL,
  short_name TEXT,
  slug TEXT UNIQUE,
  type TEXT NOT NULL DEFAULT 'RAC',
  district TEXT,
  area TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  contact_name TEXT,
  memo TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES clubs(id),
  district_id TEXT REFERENCES districts(id),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  name_kana TEXT,
  birth_date TEXT,
  phone TEXT,
  address_zip TEXT,
  address TEXT,
  occupation TEXT,
  allergy TEXT,
  dietary_note TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  member_type TEXT NOT NULL DEFAULT 'RAC',
  role TEXT NOT NULL DEFAULT 'member',
  is_active INTEGER NOT NULL DEFAULT 1,
  joined_at TEXT,
  left_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  district_id TEXT,
  title TEXT NOT NULL,
  meeting_number INTEGER,
  theme TEXT,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  venue_name TEXT,
  venue_address TEXT,
  committee TEXT,
  manager_user_id TEXT REFERENCES users(id),
  description TEXT,
  program_detail TEXT,
  fee_rac INTEGER NOT NULL DEFAULT 0,
  fee_rc INTEGER NOT NULL DEFAULT 0,
  fee_obog INTEGER NOT NULL DEFAULT 0,
  fee_guest INTEGER NOT NULL DEFAULT 0,
  meal_fee INTEGER NOT NULL DEFAULT 0,
  mu_registration_slug TEXT UNIQUE,
  mu_registration_url TEXT,
  registration_deadline TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS attendances (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  user_id TEXT REFERENCES users(id),
  external_name TEXT,
  external_email TEXT,
  external_phone TEXT,
  club_id TEXT,
  club_name TEXT,
  member_type TEXT NOT NULL DEFAULT 'RAC',
  attendance_status TEXT NOT NULL DEFAULT 'undecided',
  registration_type TEXT NOT NULL DEFAULT 'member',
  meal_required INTEGER NOT NULL DEFAULT 0,
  fee_amount INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payment_method TEXT,
  paid_at TEXT,
  receipt_required INTEGER NOT NULL DEFAULT 0,
  receipt_name_type TEXT,
  receipt_name TEXT,
  note TEXT,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS annual_fees (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  fiscal_year INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payment_method TEXT,
  paid_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  meeting_id TEXT REFERENCES meetings(id),
  type TEXT NOT NULL DEFAULT 'income',
  amount INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  transaction_date TEXT NOT NULL,
  category TEXT,
  payment_method TEXT,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  meeting_id TEXT REFERENCES meetings(id),
  attendance_id TEXT REFERENCES attendances(id),
  transaction_id TEXT,
  receipt_number TEXT NOT NULL,
  receipt_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  issued_date TEXT NOT NULL,
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'issued',
  issued_by TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES clubs(id),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  template_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES clubs(id),
  meeting_id TEXT REFERENCES meetings(id),
  template_id TEXT REFERENCES email_templates(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  target_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS email_recipients (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES emails(id),
  user_id TEXT REFERENCES users(id),
  email_address TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meeting_reports (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  club_id TEXT NOT NULL REFERENCES clubs(id),
  content TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_by TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  user_id TEXT REFERENCES users(id),
  meeting_id TEXT REFERENCES meetings(id),
  type TEXT NOT NULL DEFAULT 'donation',
  amount INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  donated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_users_club_id ON users(club_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_meetings_club_id ON meetings(club_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
CREATE INDEX IF NOT EXISTS idx_meetings_mu_slug ON meetings(mu_registration_slug);
CREATE INDEX IF NOT EXISTS idx_attendances_meeting_id ON attendances(meeting_id);
CREATE INDEX IF NOT EXISTS idx_attendances_user_id ON attendances(user_id);
CREATE INDEX IF NOT EXISTS idx_attendances_ext_email ON attendances(external_email);
CREATE INDEX IF NOT EXISTS idx_annual_fees_user_id ON annual_fees(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_club_id ON transactions(club_id);
CREATE INDEX IF NOT EXISTS idx_receipts_club_id ON receipts(club_id);
