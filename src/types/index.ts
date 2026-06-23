// RAC Cloud - 型定義

// ============================================================
// 権限ロール
// ============================================================
export type UserRole = 
  // ── 主要4ロール ──
  | 'system_owner'      // 全権管理者
  | 'district_admin'    // 地区管理者
  | 'club_account'      // クラブアカウント（クラブ単位でログイン）
  | 'member'            // 個人会員
  // ── 後方互換（旧ロール。新規では使用しない） ──
  | 'club_admin'
  | 'president'
  | 'secretary'
  | 'treasurer'
  | 'committee_chair'
  | 'sponsor_rotarian'
  | 'external'
  | 'district_representative'
  | 'district_secretary'
  | 'district_treasurer'
  | 'district_pr_chair'
  | 'zone_representative';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  // 主要4ロール
  system_owner: 'システムオーナー',
  district_admin: '地区管理者',
  club_account: 'クラブアカウント',
  member: '個人会員',
  // 後方互換
  club_admin: 'クラブ管理者（旧）',
  president: '会長',
  secretary: '幹事',
  treasurer: '会計',
  committee_chair: '委員長',
  sponsor_rotarian: 'スポンサーロータリアン',
  external: '外部参加者',
  district_representative: '地区代表',
  district_secretary: '地区幹事',
  district_treasurer: '地区会計',
  district_pr_chair: '地区広報委員長',
  zone_representative: 'ゾーン代表',
};

// 新規登録時に選択可能なロール（シンプル4種）
export const PRIMARY_ROLE_LABELS: Partial<Record<UserRole, string>> = {
  system_owner: 'システムオーナー',
  district_admin: '地区管理者',
  club_account: 'クラブアカウント',
  member: '個人会員',
};

// ユーザーの承認ステータス
export type UserStatus = 'pending' | 'active' | 'rejected';

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  pending: '承認待ち',
  active: '承認済み',
  rejected: '却下',
};

export const USER_STATUS_COLORS: Record<UserStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// ============================================================
// 会員区分
// ============================================================
export type MemberType = 'RAC' | 'RC' | 'OB_OG' | 'GUEST' | 'OTHER';

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  RAC: 'ローターアクター',
  RC: 'ロータリアン',
  OB_OG: 'OB・OG',
  GUEST: 'ゲスト',
  OTHER: 'その他',
};

// ============================================================
// 例会ステータス
// ============================================================
export type MeetingStatus = 'draft' | 'open' | 'closed' | 'finished' | 'cancelled';

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  draft: '下書き',
  open: '募集中',
  closed: '締切',
  finished: '終了',
  cancelled: '中止',
};

export const MEETING_STATUS_COLORS: Record<MeetingStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-yellow-100 text-yellow-700',
  finished: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};

// ============================================================
// 出席ステータス
// ============================================================
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'early_leave' | 'makeup' | 'undecided';

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: '出席',
  absent: '欠席',
  late: '遅刻',
  early_leave: '早退',
  makeup: 'MU',
  undecided: '未回答',
};

export const ATTENDANCE_STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  late: 'bg-yellow-100 text-yellow-700',
  early_leave: 'bg-orange-100 text-orange-700',
  makeup: 'bg-blue-100 text-blue-700',
  undecided: 'bg-gray-100 text-gray-500',
};

// ============================================================
// 支払ステータス
// ============================================================
export type PaymentStatus = 'unpaid' | 'paid' | 'exempt';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: '未払い',
  paid: '支払済',
  exempt: '免除',
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  unpaid: 'bg-red-100 text-red-700',
  paid: 'bg-green-100 text-green-700',
  exempt: 'bg-gray-100 text-gray-500',
};

// ============================================================
// 支払方法
// ============================================================
export type PaymentMethod = 'cash' | 'bank_transfer' | 'paypay' | 'other';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '現金',
  bank_transfer: '振込',
  paypay: 'PayPay',
  other: 'その他',
};

// ============================================================
// 取引カテゴリー
// ============================================================
export const INCOME_CATEGORIES = [
  '年会費',
  'MU費',
  'RC登録料',
  'OB・OG登録料',
  'RAC登録料',
  'ニコニコ',
  '寄付',
  '協賛金',
  'その他収入',
] as const;

export const EXPENSE_CATEGORIES = [
  '会場費',
  'お弁当代',
  '他クラブMU費',
  '資料代',
  '講師謝礼',
  '交通費',
  '備品代',
  '通信費',
  'その他支出',
] as const;

export type IncomeCategory = typeof INCOME_CATEGORIES[number];
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

// ============================================================
// 領収書ステータス
// ============================================================
export type ReceiptStatus = 'issued' | 'cancelled' | 'reissued';

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  issued: '発行済',
  cancelled: '取消',
  reissued: '再発行',
};

// ============================================================
// データモデル型定義
// ============================================================

export interface District {
  id: string;
  name: string;
  district_number: string | null;
  area_name: string | null;
  fiscal_year_start: string | null;
  fiscal_year_end: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Zone {
  id: string;
  district_id: string;
  name: string;
  zone_type: 'east' | 'west' | 'north' | 'south' | 'other';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Club {
  id: string;
  district_id: string | null;
  zone_id: string | null;
  name: string;
  short_name: string | null;
  type: 'RAC' | 'RC' | 'OB_OG' | 'GUEST' | 'OTHER';
  district: string | null;
  area: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  contact_name: string | null;
  memo: string | null;
  is_active: boolean;
  is_system_club: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface User {
  id: string;
  auth_user_id: string | null;
  club_id: string | null;
  district_id: string | null;
  zone_id: string | null;
  name: string;
  name_kana: string | null;
  email: string;
  phone: string | null;
  role: UserRole;
  member_type: MemberType;
  position: string | null;
  joined_date: string | null;
  resigned_date: string | null;
  is_active: boolean;
  status?: string; // pending / active / rejected
  memo: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Relations
  club?: Club;
}

export interface Meeting {
  id: string;
  club_id: string;
  district_id: string | null;
  title: string;
  meeting_number: number | null;
  theme: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  committee: string | null;
  manager_user_id: string | null;
  description: string | null;
  program_detail: string | null;
  registration_deadline: string | null;
  fee_rac: number;
  fee_rc: number;
  fee_obog: number;
  fee_guest: number;
  meal_fee: number;
  mu_registration_slug: string | null;
  mu_registration_url: string | null;
  status: MeetingStatus;
  is_district_event: boolean;
  is_joint_meeting: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Relations
  club?: Club;
  manager?: User;
  attendances?: Attendance[];
  _count?: {
    attendances: number;
  };
}

export interface Attendance {
  id: string;
  meeting_id: string;
  user_id: string | null;
  external_name: string | null;
  external_email: string | null;
  external_phone: string | null;
  club_id: string | null;
  club_name: string | null;
  member_type: MemberType;
  attendance_status: AttendanceStatus;
  registration_type: 'member' | 'mu' | 'rc' | 'obog' | 'guest';
  meal_required: boolean;
  fee_amount: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  receipt_required: boolean;
  receipt_name_type: 'club' | 'personal' | 'custom' | null;
  receipt_name: string | null;
  note: string | null;
  registered_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Relations
  user?: User;
  meeting?: Meeting;
  club?: Club;
}

export interface Transaction {
  id: string;
  club_id: string;
  district_id: string | null;
  meeting_id: string | null;
  transaction_type: 'income' | 'expense';
  category: string;
  amount: number;
  payer_name: string | null;
  payee_name: string | null;
  payment_method: string | null;
  transaction_date: string;
  description: string | null;
  receipt_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Relations
  meeting?: Meeting;
}

export interface AnnualFee {
  id: string;
  club_id: string;
  user_id: string;
  fiscal_year: number;
  amount: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  paid_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Relations
  user?: User;
}

export interface Donation {
  id: string;
  club_id: string;
  meeting_id: string | null;
  donor_name: string;
  donor_user_id: string | null;
  donor_type: 'RC' | 'RAC' | 'OB_OG' | 'GUEST' | 'OTHER';
  amount: number;
  message: string | null;
  payment_method: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Receipt {
  id: string;
  club_id: string;
  meeting_id: string | null;
  attendance_id: string | null;
  transaction_id: string | null;
  receipt_number: string;
  receipt_name: string;
  amount: number;
  description: string;
  issued_date: string;
  pdf_url: string | null;
  status: ReceiptStatus;
  issued_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Relations
  meeting?: Meeting;
  attendance?: Attendance;
}

export interface EmailTemplate {
  id: string;
  club_id: string | null;
  district_id: string | null;
  name: string;
  template_type: 'meeting_invitation' | 'reminder' | 'thanks' | 'registration_complete' | 'receipt' | 'annual_fee_reminder' | 'custom';
  subject_template: string;
  body_template: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Email {
  id: string;
  club_id: string | null;
  district_id: string | null;
  meeting_id: string | null;
  template_id: string | null;
  subject: string;
  body: string;
  target_type: string | null;
  status: 'draft' | 'sent' | 'failed';
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Relations
  meeting?: Meeting;
  recipients?: EmailRecipient[];
  _count?: { recipients: number };
}

export interface EmailRecipient {
  id: string;
  email_id: string;
  user_id: string | null;
  recipient_name: string;
  recipient_email: string;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface MeetingReport {
  id: string;
  club_id: string;
  district_id: string | null;
  meeting_id: string;
  title: string;
  summary: string | null;
  report_body: string | null;
  participants_count: number;
  rac_count: number;
  rc_count: number;
  obog_count: number;
  guest_count: number;
  income_total: number;
  expense_total: number;
  balance: number;
  ai_prompt: string | null;
  ai_response: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Relations
  meeting?: Meeting;
}

export interface AwardScore {
  id: string;
  district_id: string;
  fiscal_year: number;
  club_id: string;
  score_item_code: string;
  score: number;
  evidence_status: 'pending' | 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'not_applicable';
  calculation_detail: Record<string, unknown> | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Relations
  club?: Club;
}

export interface InstagramPost {
  id: string;
  district_id: string | null;
  club_id: string;
  meeting_id: string | null;
  post_type: 'before' | 'after' | 'other';
  post_url: string | null;
  posted_at: string | null;
  is_feed_post: boolean;
  score: number;
  status: 'pending' | 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'not_applicable';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CalendarEntry {
  id: string;
  district_id: string | null;
  club_id: string;
  meeting_id: string | null;
  calendar_date: string | null;
  is_entered: boolean;
  has_datetime: boolean;
  has_venue: boolean;
  has_theme: boolean;
  has_content: boolean;
  has_manager: boolean;
  has_deadline: boolean;
  score: number;
  status: 'pending' | 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'not_applicable';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ============================================================
// ダッシュボード統計
// ============================================================
export interface DashboardStats {
  nextMeeting: Meeting | null;
  upcomingMeetings: Meeting[];
  totalMembers: number;
  unpaidAnnualFees: number;
  unissuedReceipts: number;
  recentMuRegistrations: Attendance[];
  recentEmails: Email[];
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyBalance: number;
}

// ============================================================
// フォーム型
// ============================================================
export interface MuRegistrationForm {
  name: string;
  name_kana: string;
  club_name: string;
  club_id?: string;
  member_type: MemberType;
  email: string;
  phone: string;
  meal_required: boolean;
  receipt_required: boolean;
  receipt_name_type?: 'club' | 'personal' | 'custom';
  receipt_name?: string;
  note?: string;
}

// ============================================================
// API レスポンス型
// ============================================================
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
