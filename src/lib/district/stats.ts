/**
 * 地区役員画面（ダッシュボード・クラブ一覧・クラブ詳細）用の集計クエリ（サーバー専用）
 *  - すべて地区IDで絞る（他地区のデータは読まない）
 *  - クラブごとの数値は GROUP BY でまとめて取得し、N+1 を避ける
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import {
  attendances, clubReports, clubs, districtAnnouncements, districtEvents, eventRegistrations,
  instagramPosts, meetings, registrationForms, users,
} from '@/lib/db/schema';
import { DISTRICT_OFFICER_ROLES } from '@/lib/auth/tenant';
import { sanitizeConfig } from '@/lib/event-registration/server';
import type { RegistrationFormConfig } from '@/lib/event-registration/types';
import type { Db } from './context';

/** 会員数に含めないロール（地区役員・システム管理・外部参加者・クラブの共用アカウント） */
const NON_MEMBER_ROLES = [...DISTRICT_OFFICER_ROLES, 'system_owner', 'external', 'club_account'];
/** 例会数に含めない例会の状態（下書き・中止） */
const EXCLUDED_MEETING_STATUSES = ['draft', 'cancelled'];
/** 「出席」とみなす出欠の状態 */
const PRESENT_STATUSES = ['present', 'late', 'early_leave'];

export type YearRange = { start: string; end: string };

export type DistrictClub = {
  id: string;
  name: string;
  shortName: string | null;
  type: string;
  isActive: boolean;
};

export type ClubStats = {
  memberCount: number;
  meetingCount: number;
  lastMeetingDate: string | null;
  /** 開催済み例会1回あたりの自クラブ会員の出席人数（例会がなければ null） */
  avgAttendance: number | null;
  reportsSubmitted: number;
  reportsApproved: number;
  instagramApproved: number;
  instagramScore: number;
  registrationForms: number;
};

export type ClubWithStats = DistrictClub & { stats: ClubStats };

const emptyStats = (): ClubStats => ({
  memberCount: 0,
  meetingCount: 0,
  lastMeetingDate: null,
  avgAttendance: null,
  reportsSubmitted: 0,
  reportsApproved: 0,
  instagramApproved: 0,
  instagramScore: 0,
  registrationForms: 0,
});

/** 例会の集計対象条件（指定クラブ・削除/下書き/中止を除く） */
function countedMeetings(clubIds: string[]) {
  return and(
    inArray(meetings.clubId, clubIds),
    isNull(meetings.deletedAt),
    notInArray(meetings.status, EXCLUDED_MEETING_STATUSES),
  );
}

/** 会員数の集計対象条件 */
function countedMembers(clubIds: string[]) {
  return and(
    inArray(users.clubId, clubIds),
    isNull(users.deletedAt),
    eq(users.status, 'active'),
    notInArray(users.role, NON_MEMBER_ROLES),
  );
}

/** 地区のクラブ一覧（ローターアクトクラブのみ・システム用クラブは除く） */
export async function getDistrictClubs(db: Db, districtId: string): Promise<DistrictClub[]> {
  return db
    .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName, type: clubs.type, isActive: clubs.isActive })
    .from(clubs)
    .where(and(
      eq(clubs.districtId, districtId),
      isNull(clubs.deletedAt),
      eq(clubs.isSystemClub, false),
      eq(clubs.type, 'RAC'),
    ))
    .orderBy(asc(clubs.name));
}

/** クラブごとの数値をまとめて取得する */
export async function getClubStats(
  db: Db,
  districtId: string,
  clubIds: string[],
  year: YearRange,
  today: string,
): Promise<Map<string, ClubStats>> {
  const map = new Map<string, ClubStats>();
  for (const id of clubIds) map.set(id, emptyStats());
  if (clubIds.length === 0) return map;
  const get = (id: string | null) => (id ? map.get(id) : undefined);

  const [memberRows, meetingRows, lastRows, attendRows, reportRows, igRows, regRows] = await Promise.all([
    // 会員数
    db
      .select({ clubId: users.clubId, n: sql<number>`count(*)::int` })
      .from(users)
      .where(countedMembers(clubIds))
      .groupBy(users.clubId),
    // 今年度の例会数
    db
      .select({ clubId: meetings.clubId, n: sql<number>`count(*)::int` })
      .from(meetings)
      .where(and(countedMeetings(clubIds), gte(meetings.date, year.start), lte(meetings.date, year.end)))
      .groupBy(meetings.clubId),
    // 直近（今日まで）に開催した例会の日付
    db
      .select({ clubId: meetings.clubId, d: sql<string | null>`max(${meetings.date})` })
      .from(meetings)
      .where(and(countedMeetings(clubIds), lte(meetings.date, today)))
      .groupBy(meetings.clubId),
    // 今年度・開催済み例会の自クラブ会員の出席（例会ごとの人数 → クラブ単位で平均）
    db
      .select({
        clubId: meetings.clubId,
        meetingsHeld: sql<number>`count(distinct ${meetings.id})::int`,
        present: sql<number>`count(${users.id})::int`,
      })
      .from(meetings)
      .leftJoin(attendances, and(
        eq(attendances.meetingId, meetings.id),
        isNull(attendances.deletedAt),
        inArray(attendances.attendanceStatus, PRESENT_STATUSES),
      ))
      .leftJoin(users, and(eq(users.id, attendances.userId), eq(users.clubId, meetings.clubId), isNull(users.deletedAt)))
      .where(and(countedMeetings(clubIds), gte(meetings.date, year.start), lte(meetings.date, today)))
      .groupBy(meetings.clubId),
    // 報告書（今年度に作成・提出されたもの）
    db
      .select({
        clubId: clubReports.clubId,
        submitted: sql<number>`count(*) filter (where ${clubReports.status} in ('submitted','approved','rejected'))::int`,
        approved: sql<number>`count(*) filter (where ${clubReports.status} = 'approved')::int`,
      })
      .from(clubReports)
      .where(and(
        inArray(clubReports.clubId, clubIds),
        isNull(clubReports.deletedAt),
        gte(clubReports.createdAt, year.start),
      ))
      .groupBy(clubReports.clubId),
    // Instagram（今年度）
    db
      .select({
        clubId: instagramPosts.clubId,
        approved: sql<number>`count(*) filter (where ${instagramPosts.status} = 'approved')::int`,
        score: sql<number>`coalesce(sum(${instagramPosts.score}) filter (where ${instagramPosts.status} = 'approved'), 0)::int`,
      })
      .from(instagramPosts)
      .where(and(
        inArray(instagramPosts.clubId, clubIds),
        isNull(instagramPosts.deletedAt),
        gte(instagramPosts.createdAt, year.start),
      ))
      .groupBy(instagramPosts.clubId),
    // 申込済みの行事フォーム数（この地区のフォームのみ）
    db
      .select({
        clubId: eventRegistrations.clubId,
        forms: sql<number>`count(distinct ${eventRegistrations.formId})::int`,
      })
      .from(eventRegistrations)
      .innerJoin(registrationForms, eq(registrationForms.id, eventRegistrations.formId))
      .where(and(
        inArray(eventRegistrations.clubId, clubIds),
        eq(registrationForms.districtId, districtId),
        isNull(registrationForms.deletedAt),
        isNull(eventRegistrations.deletedAt),
        ne(eventRegistrations.status, 'cancelled'),
      ))
      .groupBy(eventRegistrations.clubId),
  ]);

  for (const r of memberRows) { const s = get(r.clubId); if (s) s.memberCount = Number(r.n); }
  for (const r of meetingRows) { const s = get(r.clubId); if (s) s.meetingCount = Number(r.n); }
  for (const r of lastRows) { const s = get(r.clubId); if (s) s.lastMeetingDate = r.d ?? null; }
  for (const r of attendRows) {
    const s = get(r.clubId);
    const held = Number(r.meetingsHeld);
    if (s && held > 0) s.avgAttendance = Math.round((Number(r.present) / held) * 10) / 10;
  }
  for (const r of reportRows) {
    const s = get(r.clubId);
    if (s) { s.reportsSubmitted = Number(r.submitted); s.reportsApproved = Number(r.approved); }
  }
  for (const r of igRows) {
    const s = get(r.clubId);
    if (s) { s.instagramApproved = Number(r.approved); s.instagramScore = Number(r.score); }
  }
  for (const r of regRows) { const s = get(r.clubId); if (s) s.registrationForms = Number(r.forms); }
  return map;
}

/** 地区のクラブ一覧＋数値 */
export async function getClubsWithStats(
  db: Db,
  districtId: string,
  year: YearRange,
  today: string,
): Promise<ClubWithStats[]> {
  const list = await getDistrictClubs(db, districtId);
  const stats = await getClubStats(db, districtId, list.map(c => c.id), year, today);
  return list.map(c => ({ ...c, stats: stats.get(c.id) ?? emptyStats() }));
}

// ============================================================
// 申込フォーム
// ============================================================

export type FormSummary = {
  id: string;
  districtEventId: string | null;
  config: RegistrationFormConfig;
  registrations: number;
  attendees: number;
  totalAmount: number;
  paidAmount: number;
  unpaidCount: number;
  unpaidAmount: number;
};

/** 地区の申込フォーム（削除済みを除く）と申込状況の集計 */
export async function getFormSummaries(db: Db, districtId: string): Promise<FormSummary[]> {
  const forms: { id: string; districtEventId: string | null; config: unknown }[] = await db
    .select({ id: registrationForms.id, districtEventId: registrationForms.districtEventId, config: registrationForms.config })
    .from(registrationForms)
    .where(and(eq(registrationForms.districtId, districtId), isNull(registrationForms.deletedAt)))
    .orderBy(desc(registrationForms.createdAt));
  if (forms.length === 0) return [];

  const sums: {
    formId: string; n: number; attendees: number; total: number; paid: number; unpaidCount: number; unpaidAmount: number;
  }[] = await db
    .select({
      formId: eventRegistrations.formId,
      n: sql<number>`count(*)::int`,
      attendees: sql<number>`coalesce(sum(${eventRegistrations.attendeeCount}), 0)::int`,
      total: sql<number>`coalesce(sum(${eventRegistrations.totalAmount}), 0)::int`,
      paid: sql<number>`coalesce(sum(${eventRegistrations.paidAmount}), 0)::int`,
      unpaidCount: sql<number>`count(*) filter (where ${eventRegistrations.paymentStatus} <> 'paid' and ${eventRegistrations.totalAmount} > ${eventRegistrations.paidAmount})::int`,
      unpaidAmount: sql<number>`coalesce(sum(${eventRegistrations.totalAmount} - ${eventRegistrations.paidAmount}) filter (where ${eventRegistrations.paymentStatus} <> 'paid' and ${eventRegistrations.totalAmount} > ${eventRegistrations.paidAmount}), 0)::int`,
    })
    .from(eventRegistrations)
    .where(and(
      inArray(eventRegistrations.formId, forms.map(f => f.id)),
      isNull(eventRegistrations.deletedAt),
      ne(eventRegistrations.status, 'cancelled'),
    ))
    .groupBy(eventRegistrations.formId);
  const byForm = new Map(sums.map(s => [s.formId, s]));

  return forms.map(f => {
    const s = byForm.get(f.id);
    return {
      id: f.id,
      districtEventId: f.districtEventId,
      config: sanitizeConfig(f.config),
      registrations: Number(s?.n ?? 0),
      attendees: Number(s?.attendees ?? 0),
      totalAmount: Number(s?.total ?? 0),
      paidAmount: Number(s?.paid ?? 0),
      unpaidCount: Number(s?.unpaidCount ?? 0),
      unpaidAmount: Number(s?.unpaidAmount ?? 0),
    };
  });
}

/** 2つの日付（YYYY-MM-DD）の差（日数） */
export function diffDays(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// ============================================================
// ダッシュボード
// ============================================================

export type DashboardEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  venueName: string | null;
  eventType: string;
  form: { id: string; registrations: number; attendees: number } | null;
};

export type DashboardAnnouncement = {
  id: string;
  title: string;
  level: string;
  pinned: boolean;
  publishFrom: string | null;
  createdAt: string;
};

export type DashboardData = {
  clubs: ClubWithStats[];
  memberTotal: number;
  meetingTotal: number;
  upcomingEventCount: number;
  upcomingEvents: DashboardEvent[];
  openForms: FormSummary[];
  pendingReports: number;
  pendingInstagram: number;
  unpaid: { count: number; amount: number };
  closingSoon: { id: string; title: string; deadline: string; daysLeft: number }[];
  announcements: DashboardAnnouncement[];
};

export async function getDashboardData(
  db: Db,
  districtId: string,
  year: YearRange,
  today: string,
): Promise<DashboardData> {
  const clubList = await getClubsWithStats(db, districtId, year, today);
  const clubIds = clubList.map(c => c.id);

  const [pendingRows, igRows, eventCountRows, events, forms, announcements] = await Promise.all([
    clubIds.length === 0
      ? Promise.resolve([{ n: 0 }])
      : db
        .select({ n: sql<number>`count(*)::int` })
        .from(clubReports)
        .where(and(eq(clubReports.districtId, districtId), eq(clubReports.status, 'submitted'), isNull(clubReports.deletedAt))),
    clubIds.length === 0
      ? Promise.resolve([{ n: 0 }])
      : db
        .select({ n: sql<number>`count(*)::int` })
        .from(instagramPosts)
        .where(and(eq(instagramPosts.districtId, districtId), eq(instagramPosts.status, 'pending'), isNull(instagramPosts.deletedAt))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(districtEvents)
      .where(and(eq(districtEvents.districtId, districtId), gte(districtEvents.date, today), isNull(districtEvents.deletedAt))),
    db
      .select({
        id: districtEvents.id, title: districtEvents.title, date: districtEvents.date,
        startTime: districtEvents.startTime, venueName: districtEvents.venueName, eventType: districtEvents.eventType,
      })
      .from(districtEvents)
      .where(and(eq(districtEvents.districtId, districtId), gte(districtEvents.date, today), isNull(districtEvents.deletedAt)))
      .orderBy(asc(districtEvents.date), asc(districtEvents.startTime))
      .limit(5),
    getFormSummaries(db, districtId),
    db
      .select({
        id: districtAnnouncements.id, title: districtAnnouncements.title, level: districtAnnouncements.level,
        pinned: districtAnnouncements.pinned, publishFrom: districtAnnouncements.publishFrom,
        createdAt: districtAnnouncements.createdAt,
      })
      .from(districtAnnouncements)
      .where(and(
        eq(districtAnnouncements.districtId, districtId),
        isNull(districtAnnouncements.deletedAt),
        or(isNull(districtAnnouncements.publishFrom), lte(districtAnnouncements.publishFrom, today)),
        or(isNull(districtAnnouncements.publishUntil), gte(districtAnnouncements.publishUntil, today)),
      ))
      .orderBy(desc(districtAnnouncements.pinned), desc(districtAnnouncements.createdAt))
      .limit(3)
      // お知らせのテーブルがまだ無い環境でもダッシュボードは表示する
      .catch(() => [] as DashboardAnnouncement[]),
  ]);

  const formByEvent = new Map<string, FormSummary>();
  for (const f of forms) if (f.districtEventId && !formByEvent.has(f.districtEventId)) formByEvent.set(f.districtEventId, f);

  const openForms = forms.filter(f => f.config.status === 'open');
  const unpaid = openForms.reduce(
    (acc, f) => ({ count: acc.count + f.unpaidCount, amount: acc.amount + f.unpaidAmount }),
    { count: 0, amount: 0 },
  );
  const closingSoon = openForms
    .filter(f => f.config.deadline)
    .map(f => ({ id: f.id, title: f.config.title || '（無題のフォーム）', deadline: f.config.deadline as string, daysLeft: diffDays(today, f.config.deadline as string) }))
    .filter(f => f.daysLeft >= 0 && f.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    clubs: clubList,
    memberTotal: clubList.reduce((n, c) => n + c.stats.memberCount, 0),
    meetingTotal: clubList.reduce((n, c) => n + c.stats.meetingCount, 0),
    upcomingEventCount: Number(eventCountRows[0]?.n ?? 0),
    upcomingEvents: (events as Omit<DashboardEvent, 'form'>[]).map(e => {
      const f = formByEvent.get(e.id);
      return { ...e, form: f ? { id: f.id, registrations: f.registrations, attendees: f.attendees } : null };
    }),
    openForms,
    pendingReports: Number(pendingRows[0]?.n ?? 0),
    pendingInstagram: Number(igRows[0]?.n ?? 0),
    unpaid,
    closingSoon,
    announcements,
  };
}

// ============================================================
// クラブ詳細
// ============================================================

export type ClubDetail = {
  club: {
    id: string; name: string; shortName: string | null; type: string; email: string | null;
    contactName: string | null; isActive: boolean;
  };
  stats: ClubStats;
  members: {
    id: string; name: string; nameKana: string | null; position: string | null; role: string;
    memberType: string; status: string; isActive: boolean;
  }[];
  meetings: {
    id: string; title: string; meetingNumber: number | null; date: string; status: string; present: number;
  }[];
  reports: { id: string; title: string; reportType: string; status: string; deadline: string | null; submittedAt: string | null; createdAt: string }[];
  instagram: { id: string; postType: string; postUrl: string | null; status: string; score: number; submittedAt: string | null; createdAt: string }[];
  registrations: {
    id: string; formId: string; formTitle: string; eventDate: string | null; attendeeCount: number;
    totalAmount: number; paidAmount: number; paymentStatus: string; status: string; submittedAt: string;
  }[];
};

/** クラブ詳細（地区に属さないクラブなら null） */
export async function getClubDetail(
  db: Db,
  districtId: string,
  clubId: string,
  year: YearRange,
  today: string,
): Promise<ClubDetail | null> {
  const [club] = await db
    .select({
      id: clubs.id, name: clubs.name, shortName: clubs.shortName, type: clubs.type, email: clubs.email,
      contactName: clubs.contactName, isActive: clubs.isActive,
    })
    .from(clubs)
    .where(and(eq(clubs.id, clubId), eq(clubs.districtId, districtId), isNull(clubs.deletedAt), eq(clubs.isSystemClub, false)))
    .limit(1);
  if (!club) return null;

  const [statsMap, members, meetingRows, reports, instagram, regRows] = await Promise.all([
    getClubStats(db, districtId, [clubId], year, today),
    // 会員一覧（個人情報になる誕生日・住所・アレルギー等は取得しない）
    db
      .select({
        id: users.id, name: users.name, nameKana: users.nameKana, position: users.position, role: users.role,
        memberType: users.memberType, status: users.status, isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.clubId, clubId), isNull(users.deletedAt), notInArray(users.role, NON_MEMBER_ROLES)))
      .orderBy(asc(users.nameKana), asc(users.name)),
    // 今年度の例会と自クラブ会員の出席人数
    db
      .select({
        id: meetings.id, title: meetings.title, meetingNumber: meetings.meetingNumber, date: meetings.date,
        status: meetings.status, present: sql<number>`count(${users.id})::int`,
      })
      .from(meetings)
      .leftJoin(attendances, and(
        eq(attendances.meetingId, meetings.id),
        isNull(attendances.deletedAt),
        inArray(attendances.attendanceStatus, PRESENT_STATUSES),
      ))
      .leftJoin(users, and(eq(users.id, attendances.userId), eq(users.clubId, meetings.clubId), isNull(users.deletedAt)))
      .where(and(
        eq(meetings.clubId, clubId),
        isNull(meetings.deletedAt),
        ne(meetings.status, 'draft'),
        gte(meetings.date, year.start),
        lte(meetings.date, year.end),
      ))
      .groupBy(meetings.id)
      .orderBy(desc(meetings.date)),
    db
      .select({
        id: clubReports.id, title: clubReports.title, reportType: clubReports.reportType, status: clubReports.status,
        deadline: clubReports.deadline, submittedAt: clubReports.submittedAt, createdAt: clubReports.createdAt,
      })
      .from(clubReports)
      .where(and(eq(clubReports.clubId, clubId), isNull(clubReports.deletedAt), ne(clubReports.status, 'draft')))
      .orderBy(desc(clubReports.createdAt))
      .limit(30),
    db
      .select({
        id: instagramPosts.id, postType: instagramPosts.postType, postUrl: instagramPosts.postUrl,
        status: instagramPosts.status, score: instagramPosts.score, submittedAt: instagramPosts.submittedAt,
        createdAt: instagramPosts.createdAt,
      })
      .from(instagramPosts)
      .where(and(eq(instagramPosts.clubId, clubId), isNull(instagramPosts.deletedAt)))
      .orderBy(desc(instagramPosts.createdAt))
      .limit(30),
    db
      .select({
        id: eventRegistrations.id, formId: eventRegistrations.formId, config: registrationForms.config,
        attendeeCount: eventRegistrations.attendeeCount, totalAmount: eventRegistrations.totalAmount,
        paidAmount: eventRegistrations.paidAmount, paymentStatus: eventRegistrations.paymentStatus,
        status: eventRegistrations.status, submittedAt: eventRegistrations.submittedAt,
      })
      .from(eventRegistrations)
      .innerJoin(registrationForms, eq(registrationForms.id, eventRegistrations.formId))
      .where(and(
        eq(eventRegistrations.clubId, clubId),
        eq(registrationForms.districtId, districtId),
        isNull(registrationForms.deletedAt),
        isNull(eventRegistrations.deletedAt),
      ))
      .orderBy(desc(eventRegistrations.submittedAt)),
  ]);

  return {
    club,
    stats: statsMap.get(clubId) ?? emptyStats(),
    members,
    meetings: (meetingRows as ClubDetail['meetings']).map(m => ({ ...m, present: Number(m.present) })),
    reports,
    instagram,
    registrations: (regRows as (Omit<ClubDetail['registrations'][number], 'formTitle' | 'eventDate'> & { config: unknown })[])
      .map(({ config, ...r }) => {
        const c = sanitizeConfig(config);
        return { ...r, formTitle: c.title || '（無題のフォーム）', eventDate: c.eventDate };
      }),
  };
}
