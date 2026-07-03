import { pgTable, text, integer, real, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

// ============================================================
// clubs テーブル
// ============================================================
export const clubs = pgTable('clubs', {
  id: text('id').primaryKey(),
  districtId: text('district_id'),
  zoneId: text('zone_id'),
  name: text('name').notNull(),
  shortName: text('short_name'),
  slug: text('slug'),
  type: text('type').notNull().default('RAC'),
  district: text('district'),
  area: text('area'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  contactName: text('contact_name'),
  memo: text('memo'),
  isActive: boolean('is_active').notNull().default(true),
  isSystemClub: boolean('is_system_club').notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// users テーブル
// ============================================================
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  clubId: text('club_id').references(() => clubs.id),
  districtId: text('district_id'),
  zoneId: text('zone_id'),
  name: text('name').notNull(),
  nameKana: text('name_kana'),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull().default(''),
  phone: text('phone'),
  role: text('role').notNull().default('member'),
  memberType: text('member_type').notNull().default('RAC'),
  position: text('position'),
  joinedAt: text('joined_at'),
  resignedAt: text('resigned_at'),
  isActive: boolean('is_active').notNull().default(true),
  status: text('status').notNull().default('active'),
  birthDate: text('birth_date'),
  addressZip: text('address_zip'),
  address: text('address'),
  occupation: text('occupation'),
  allergy: text('allergy'),
  dietaryNote: text('dietary_note'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  memo: text('memo'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// Auth.js sessions テーブル
// ============================================================
export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').notNull().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: text('expires').notNull(),
});

// ============================================================
// meetings テーブル
// ============================================================
export const meetings = pgTable('meetings', {
  id: text('id').primaryKey(),
  clubId: text('club_id').notNull().references(() => clubs.id),
  districtId: text('district_id'),
  title: text('title').notNull(),
  meetingNumber: integer('meeting_number'),
  theme: text('theme'),
  date: text('date').notNull(),
  startTime: text('start_time'),
  endTime: text('end_time'),
  venueName: text('venue_name'),
  venueAddress: text('venue_address'),
  committee: text('committee'),
  managerUserId: text('manager_user_id').references(() => users.id),
  description: text('description'),
  programDetail: text('program_detail'),
  registrationDeadline: text('registration_deadline'),
  feeRac: integer('fee_rac').notNull().default(0),
  feeRc: integer('fee_rc').notNull().default(0),
  feeObog: integer('fee_obog').notNull().default(0),
  feeGuest: integer('fee_guest').notNull().default(0),
  mealFee: integer('meal_fee').notNull().default(0),
  muRegistrationSlug: text('mu_registration_slug'),
  muRegistrationUrl: text('mu_registration_url'),
  status: text('status').notNull().default('draft'),
  isDistrictEvent: boolean('is_district_event').notNull().default(false),
  isJointMeeting: boolean('is_joint_meeting').notNull().default(false),
  location: text('location'),
  note: text('note'),
  createdBy: text('created_by'),
  hasAfterParty: boolean('has_after_party').notNull().default(false),
  afterPartyVenue: text('after_party_venue'),
  afterPartyStartTime: text('after_party_start_time'),
  afterPartyFeeRac: integer('after_party_fee_rac').notNull().default(0),
  afterPartyFeeRc: integer('after_party_fee_rc').notNull().default(0),
  afterPartyFeeObog: integer('after_party_fee_obog').notNull().default(0),
  afterPartyFeeGuest: integer('after_party_fee_guest').notNull().default(0),
  capacity: integer('capacity'),
  afterPartyCapacity: integer('after_party_capacity'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// attendances テーブル
// ============================================================
export const attendances = pgTable('attendances', {
  id: text('id').primaryKey(),
  meetingId: text('meeting_id').notNull().references(() => meetings.id),
  userId: text('user_id').references(() => users.id),
  externalName: text('external_name'),
  externalEmail: text('external_email'),
  externalPhone: text('external_phone'),
  clubId: text('club_id'),
  clubName: text('club_name'),
  memberType: text('member_type').notNull().default('RAC'),
  attendanceStatus: text('attendance_status').notNull().default('undecided'),
  registrationType: text('registration_type').notNull().default('member'),
  mealRequired: boolean('meal_required').notNull().default(false),
  feeAmount: integer('fee_amount').notNull().default(0),
  paymentStatus: text('payment_status').notNull().default('unpaid'),
  paymentMethod: text('payment_method'),
  paidAt: text('paid_at'),
  receiptRequired: boolean('receipt_required').notNull().default(false),
  receiptNameType: text('receipt_name_type'),
  receiptName: text('receipt_name'),
  note: text('note'),
  participationType: text('participation_type').notNull().default('meeting_only'),
  afterPartyFeeAmount: integer('after_party_fee_amount').notNull().default(0),
  registeredAt: text('registered_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// annual_fees テーブル
// ============================================================
export const annualFees = pgTable('annual_fees', {
  id: text('id').primaryKey(),
  clubId: text('club_id').notNull().references(() => clubs.id),
  userId: text('user_id').notNull().references(() => users.id),
  fiscalYear: integer('fiscal_year').notNull(),
  amount: integer('amount').notNull().default(0),
  paymentStatus: text('payment_status').notNull().default('unpaid'),
  paymentMethod: text('payment_method'),
  paidAt: text('paid_at'),
  note: text('note'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// transactions テーブル
// ============================================================
export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  clubId: text('club_id').notNull().references(() => clubs.id),
  districtId: text('district_id'),
  meetingId: text('meeting_id').references(() => meetings.id),
  transactionType: text('transaction_type').notNull(),
  category: text('category').notNull(),
  amount: integer('amount').notNull().default(0),
  payerName: text('payer_name'),
  payeeName: text('payee_name'),
  paymentMethod: text('payment_method'),
  transactionDate: text('transaction_date').notNull(),
  description: text('description'),
  receiptId: text('receipt_id'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// receipts テーブル
// ============================================================
export const receipts = pgTable('receipts', {
  id: text('id').primaryKey(),
  clubId: text('club_id').notNull().references(() => clubs.id),
  meetingId: text('meeting_id').references(() => meetings.id),
  attendanceId: text('attendance_id').references(() => attendances.id),
  transactionId: text('transaction_id'),
  receiptNumber: text('receipt_number').notNull(),
  receiptName: text('receipt_name').notNull(),
  amount: integer('amount').notNull().default(0),
  description: text('description').notNull().default(''),
  issuedDate: text('issued_date').notNull(),
  pdfUrl: text('pdf_url'),
  status: text('status').notNull().default('issued'),
  issuedBy: text('issued_by'),
  cancelReason: text('cancel_reason'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// emails テーブル
// ============================================================
export const emails = pgTable('emails', {
  id: text('id').primaryKey(),
  clubId: text('club_id').references(() => clubs.id),
  districtId: text('district_id'),
  meetingId: text('meeting_id').references(() => meetings.id),
  templateId: text('template_id'),
  subject: text('subject').notNull(),
  body: text('body').notNull().default(''),
  targetType: text('target_type'),
  ccEmails: text('cc_emails'),
  bccEmails: text('bcc_emails'),
  replyTo: text('reply_to'),
  status: text('status').notNull().default('draft'),
  sentAt: text('sent_at'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// email_recipients テーブル
// ============================================================
export const emailRecipients = pgTable('email_recipients', {
  id: text('id').primaryKey(),
  emailId: text('email_id').notNull().references(() => emails.id),
  userId: text('user_id').references(() => users.id),
  recipientName: text('recipient_name').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  sentAt: text('sent_at'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
});

// ============================================================
// email_templates テーブル
// ============================================================
export const emailTemplates = pgTable('email_templates', {
  id: text('id').primaryKey(),
  clubId: text('club_id').references(() => clubs.id),
  districtId: text('district_id'),
  name: text('name').notNull(),
  templateType: text('template_type').notNull().default('custom'),
  subjectTemplate: text('subject_template').notNull(),
  bodyTemplate: text('body_template').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// donations テーブル
// ============================================================
export const donations = pgTable('donations', {
  id: text('id').primaryKey(),
  clubId: text('club_id').notNull().references(() => clubs.id),
  meetingId: text('meeting_id').references(() => meetings.id),
  donorName: text('donor_name').notNull(),
  donorUserId: text('donor_user_id').references(() => users.id),
  donorType: text('donor_type').notNull().default('RAC'),
  amount: integer('amount').notNull().default(0),
  message: text('message'),
  paymentMethod: text('payment_method'),
  receivedAt: text('received_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// meeting_reports テーブル
// ============================================================
export const meetingReports = pgTable('meeting_reports', {
  id: text('id').primaryKey(),
  clubId: text('club_id').notNull().references(() => clubs.id),
  districtId: text('district_id'),
  meetingId: text('meeting_id').notNull().references(() => meetings.id),
  title: text('title').notNull(),
  summary: text('summary'),
  reportBody: text('report_body'),
  participantsCount: integer('participants_count').notNull().default(0),
  racCount: integer('rac_count').notNull().default(0),
  rcCount: integer('rc_count').notNull().default(0),
  obogCount: integer('obog_count').notNull().default(0),
  guestCount: integer('guest_count').notNull().default(0),
  incomeTotal: integer('income_total').notNull().default(0),
  expenseTotal: integer('expense_total').notNull().default(0),
  balance: integer('balance').notNull().default(0),
  aiPrompt: text('ai_prompt'),
  aiResponse: text('ai_response'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// districts テーブル
// ============================================================
export const districts = pgTable('districts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  districtNumber: text('district_number'),
  areaName: text('area_name'),
  fiscalYearStart: text('fiscal_year_start'),
  fiscalYearEnd: text('fiscal_year_end'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// district_events テーブル（地区行事）
// ============================================================
export const districtEvents = pgTable('district_events', {
  id: text('id').primaryKey(),
  districtId: text('district_id').notNull().references(() => districts.id),
  hostClubId: text('host_club_id').references(() => clubs.id),
  title: text('title').notNull(),
  eventType: text('event_type').notNull().default('その他'),
  date: text('date').notNull(),
  startTime: text('start_time'),
  endTime: text('end_time'),
  venueName: text('venue_name'),
  venueAddress: text('venue_address'),
  registrationFee: integer('registration_fee').notNull().default(0),
  registrationDeadline: text('registration_deadline'),
  description: text('description'),
  isAwardTarget: boolean('is_award_target').notNull().default(false),
  isJointMeeting: boolean('is_joint_meeting').notNull().default(false),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// club_reports テーブル（クラブ報告書）
// ============================================================
export const clubReports = pgTable('club_reports', {
  id: text('id').primaryKey(),
  districtId: text('district_id').references(() => districts.id),
  clubId: text('club_id').notNull().references(() => clubs.id),
  meetingId: text('meeting_id').references(() => meetings.id),
  title: text('title').notNull(),
  reportType: text('report_type').notNull().default('meeting'),
  status: text('status').notNull().default('draft'),
  deadline: text('deadline'),
  submittedAt: text('submitted_at'),
  approvedAt: text('approved_at'),
  rejectedAt: text('rejected_at'),
  rejectionReason: text('rejection_reason'),
  content: text('content'),
  submittedBy: text('submitted_by').references(() => users.id),
  reviewedBy: text('reviewed_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// instagram_posts テーブル（Instagram投稿管理）
// ============================================================
export const instagramPosts = pgTable('instagram_posts', {
  id: text('id').primaryKey(),
  districtId: text('district_id').references(() => districts.id),
  clubId: text('club_id').notNull().references(() => clubs.id),
  meetingId: text('meeting_id').references(() => meetings.id),
  postType: text('post_type').notNull().default('after'),
  postUrl: text('post_url'),
  caption: text('caption'),
  imageUrl: text('image_url'),
  status: text('status').notNull().default('pending'),
  score: integer('score').notNull().default(0),
  reviewedBy: text('reviewed_by').references(() => users.id),
  reviewedAt: text('reviewed_at'),
  rejectionReason: text('rejection_reason'),
  submittedBy: text('submitted_by').references(() => users.id),
  submittedAt: text('submitted_at'),
  createdAt: text('created_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  updatedAt: text('updated_at').notNull().default(sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`),
  deletedAt: text('deleted_at'),
});

// ============================================================
// Relations
// ============================================================
export const clubsRelations = relations(clubs, ({ many }) => ({
  users: many(users),
  meetings: many(meetings),
  annualFees: many(annualFees),
  transactions: many(transactions),
  receipts: many(receipts),
  emails: many(emails),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  club: one(clubs, { fields: [users.clubId], references: [clubs.id] }),
  attendances: many(attendances),
  annualFees: many(annualFees),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  club: one(clubs, { fields: [meetings.clubId], references: [clubs.id] }),
  manager: one(users, { fields: [meetings.managerUserId], references: [users.id] }),
  attendances: many(attendances),
  transactions: many(transactions),
  receipts: many(receipts),
  emails: many(emails),
}));

export const attendancesRelations = relations(attendances, ({ one }) => ({
  meeting: one(meetings, { fields: [attendances.meetingId], references: [meetings.id] }),
  user: one(users, { fields: [attendances.userId], references: [users.id] }),
}));

export const annualFeesRelations = relations(annualFees, ({ one }) => ({
  club: one(clubs, { fields: [annualFees.clubId], references: [clubs.id] }),
  user: one(users, { fields: [annualFees.userId], references: [users.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  club: one(clubs, { fields: [transactions.clubId], references: [clubs.id] }),
  meeting: one(meetings, { fields: [transactions.meetingId], references: [meetings.id] }),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  club: one(clubs, { fields: [receipts.clubId], references: [clubs.id] }),
  meeting: one(meetings, { fields: [receipts.meetingId], references: [meetings.id] }),
  attendance: one(attendances, { fields: [receipts.attendanceId], references: [attendances.id] }),
}));

export const emailsRelations = relations(emails, ({ one, many }) => ({
  club: one(clubs, { fields: [emails.clubId], references: [clubs.id] }),
  meeting: one(meetings, { fields: [emails.meetingId], references: [meetings.id] }),
  template: one(emailTemplates, { fields: [emails.templateId], references: [emailTemplates.id] }),
  recipients: many(emailRecipients),
}));

export const emailRecipientsRelations = relations(emailRecipients, ({ one }) => ({
  email: one(emails, { fields: [emailRecipients.emailId], references: [emails.id] }),
  user: one(users, { fields: [emailRecipients.userId], references: [users.id] }),
}));

// ============================================================
// 型エクスポート
// ============================================================
export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type Attendance = typeof attendances.$inferSelect;
export type NewAttendance = typeof attendances.$inferInsert;
export type AnnualFee = typeof annualFees.$inferSelect;
export type NewAnnualFee = typeof annualFees.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
export type Donation = typeof donations.$inferSelect;
export type DistrictEvent = typeof districtEvents.$inferSelect;
export type NewDistrictEvent = typeof districtEvents.$inferInsert;
export type ClubReport = typeof clubReports.$inferSelect;
export type NewClubReport = typeof clubReports.$inferInsert;
export type InstagramPost = typeof instagramPosts.$inferSelect;
export type NewInstagramPost = typeof instagramPosts.$inferInsert;
