/**
 * クラブ→地区への提出（報告書・Instagram）のサーバー側共通処理
 *  - 認可（ログインユーザーのロールと所属クラブを DB から確認。クライアントの clubId は信用しない）
 *  - 一覧の読み込み、入力チェック
 * （クラブ側の画面 /district-submissions と API の両方から使う）
 */
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubReports, clubs, instagramPosts, meetingReports, meetings, users } from '@/lib/db/schema';
import { resolveDistrict, todayJst } from '@/lib/district/context';
import {
  LIMITS, canSubmitToDistrict, checkPostUrl, cleanText, isPostType, isReportType,
  type PostType, type ReportType,
} from '@/lib/district/submissions';

export type Db = Awaited<ReturnType<typeof getDbFromContext>>;

export type SubmitterContext = {
  db: Db;
  user: { id: string; name: string; role: string };
  club: { id: string; name: string };
  districtId: string | null;
};

/** 提出画面を使えるユーザーか確認し、クラブ・地区を解決する */
export async function getSubmitter(): Promise<
  ({ ok: true } & SubmitterContext) | { ok: false; status: number; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401, error: 'ログインしてください' };
  const db = await getDbFromContext();
  const [me] = await db
    .select({ id: users.id, name: users.name, role: users.role, clubId: users.clubId, districtId: users.districtId })
    .from(users)
    // 無効化・却下されたアカウントは古いセッションでも提出させない
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt), eq(users.isActive, true), eq(users.status, 'active')))
    .limit(1);
  if (!me || !canSubmitToDistrict(me.role, me.clubId) || !me.clubId) {
    return { ok: false, status: 403, error: 'この画面はクラブの役員アカウントのみ利用できます' };
  }
  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName, districtId: clubs.districtId })
    .from(clubs)
    .where(and(eq(clubs.id, me.clubId), isNull(clubs.deletedAt)))
    .limit(1);
  if (!club) return { ok: false, status: 403, error: '所属クラブが見つかりません' };

  let districtId = club.districtId;
  if (!districtId) {
    const d = await resolveDistrict(db, { districtId: me.districtId, clubId: me.clubId });
    districtId = d?.id ?? null;
  }
  return {
    ok: true,
    db,
    user: { id: me.id, name: me.name, role: me.role },
    club: { id: club.id, name: club.shortName || club.name },
    districtId,
  };
}

// ------------------------------------------------------------
// 一覧の読み込み
// ------------------------------------------------------------

export type ClubReportItem = {
  id: string;
  reportType: string;
  title: string;
  content: string | null;
  status: string;
  meetingId: string | null;
  meetingTitle: string | null;
  meetingDate: string | null;
  meetingNumber: number | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClubPostItem = {
  id: string;
  postType: string;
  postUrl: string | null;
  caption: string | null;
  status: string;
  score: number;
  rejectionReason: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  meetingDate: string | null;
  meetingNumber: number | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type MeetingOption = {
  id: string;
  title: string;
  date: string;
  meetingNumber: number | null;
  hasReport: boolean;
};

export type ClubSubmissionsData = {
  club: { id: string; name: string };
  hasDistrict: boolean;
  reports: ClubReportItem[];
  posts: ClubPostItem[];
  meetings: MeetingOption[];
};

/** 日付に日数を足す（YYYY-MM-DD） */
function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function loadClubSubmissions(ctx: SubmitterContext): Promise<ClubSubmissionsData> {
  const { db, club } = ctx;
  const today = todayJst();
  const [reports, posts, meetingRows] = await Promise.all([
    db
      .select({
        id: clubReports.id,
        reportType: clubReports.reportType,
        title: clubReports.title,
        content: clubReports.content,
        status: clubReports.status,
        meetingId: clubReports.meetingId,
        meetingTitle: meetings.title,
        meetingDate: meetings.date,
        meetingNumber: meetings.meetingNumber,
        submittedAt: clubReports.submittedAt,
        approvedAt: clubReports.approvedAt,
        rejectedAt: clubReports.rejectedAt,
        rejectionReason: clubReports.rejectionReason,
        createdAt: clubReports.createdAt,
        updatedAt: clubReports.updatedAt,
      })
      .from(clubReports)
      .leftJoin(meetings, eq(clubReports.meetingId, meetings.id))
      .where(and(eq(clubReports.clubId, club.id), isNull(clubReports.deletedAt)))
      .orderBy(desc(clubReports.updatedAt)),
    db
      .select({
        id: instagramPosts.id,
        postType: instagramPosts.postType,
        postUrl: instagramPosts.postUrl,
        caption: instagramPosts.caption,
        status: instagramPosts.status,
        score: instagramPosts.score,
        rejectionReason: instagramPosts.rejectionReason,
        meetingId: instagramPosts.meetingId,
        meetingTitle: meetings.title,
        meetingDate: meetings.date,
        meetingNumber: meetings.meetingNumber,
        submittedAt: instagramPosts.submittedAt,
        reviewedAt: instagramPosts.reviewedAt,
        createdAt: instagramPosts.createdAt,
      })
      .from(instagramPosts)
      .leftJoin(meetings, eq(instagramPosts.meetingId, meetings.id))
      .where(and(eq(instagramPosts.clubId, club.id), isNull(instagramPosts.deletedAt)))
      .orderBy(desc(instagramPosts.createdAt)),
    // 選択肢の例会：過去1年〜3か月先まで
    db
      .select({ id: meetings.id, title: meetings.title, date: meetings.date, meetingNumber: meetings.meetingNumber })
      .from(meetings)
      .where(and(
        eq(meetings.clubId, club.id),
        isNull(meetings.deletedAt),
        gte(meetings.date, addDays(today, -366)),
        lte(meetings.date, addDays(today, 92)),
      ))
      .orderBy(desc(meetings.date)),
  ]);

  const ids = meetingRows.map((m) => m.id);
  const withReport = new Set<string>();
  if (ids.length > 0) {
    const mr = await db
      .select({ meetingId: meetingReports.meetingId })
      .from(meetingReports)
      .where(and(eq(meetingReports.clubId, club.id), inArray(meetingReports.meetingId, ids), isNull(meetingReports.deletedAt)));
    mr.forEach((r) => withReport.add(r.meetingId));
  }

  return {
    club,
    hasDistrict: !!ctx.districtId,
    reports,
    posts,
    meetings: meetingRows.map((m) => ({ ...m, hasReport: withReport.has(m.id) })),
  };
}

/** 例会報告書（meeting_reports）の本文を取得（自クラブのみ） */
export async function loadMeetingReport(
  ctx: SubmitterContext,
  meetingId: string,
): Promise<{ title: string; content: string } | null> {
  const [r] = await ctx.db
    .select({ title: meetingReports.title, summary: meetingReports.summary, reportBody: meetingReports.reportBody })
    .from(meetingReports)
    .where(and(eq(meetingReports.clubId, ctx.club.id), eq(meetingReports.meetingId, meetingId), isNull(meetingReports.deletedAt)))
    .orderBy(desc(meetingReports.updatedAt))
    .limit(1);
  if (!r) return null;
  const body = r.reportBody?.trim() || r.summary?.trim() || '';
  return { title: r.title, content: body };
}

// ------------------------------------------------------------
// 入力チェック
// ------------------------------------------------------------

/** 例会IDが自クラブのものか確認（空なら null） */
async function checkMeeting(ctx: SubmitterContext, v: unknown): Promise<{ ok: true; meetingId: string | null } | { ok: false; error: string }> {
  if (v === undefined || v === null || v === '') return { ok: true, meetingId: null };
  if (typeof v !== 'string' || v.length > 100) return { ok: false, error: '例会の指定が正しくありません' };
  const [m] = await ctx.db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.id, v), eq(meetings.clubId, ctx.club.id), isNull(meetings.deletedAt)))
    .limit(1);
  if (!m) return { ok: false, error: '選択された例会が見つかりません' };
  return { ok: true, meetingId: m.id };
}

export type ReportInput = { reportType: ReportType; meetingId: string | null; title: string; content: string; submit: boolean };

export async function parseReportInput(
  ctx: SubmitterContext,
  body: Record<string, unknown>,
): Promise<{ ok: true; value: ReportInput } | { ok: false; error: string }> {
  if (!isReportType(body.reportType)) return { ok: false, error: '報告書の種類を選んでください' };
  const title = cleanText(body.title);
  if (!title) return { ok: false, error: 'タイトルを入力してください' };
  if (title.length > LIMITS.title) return { ok: false, error: `タイトルは${LIMITS.title}文字以内で入力してください` };
  const content = cleanText(body.content);
  if (content.length > LIMITS.content) return { ok: false, error: `内容は${LIMITS.content}文字以内で入力してください` };
  const submit = body.submit === true;
  if (submit && !content) return { ok: false, error: '地区へ提出するには内容を入力してください' };
  const m = await checkMeeting(ctx, body.meetingId);
  if (!m.ok) return m;
  return { ok: true, value: { reportType: body.reportType, meetingId: m.meetingId, title, content, submit } };
}

export type PostInput = { postType: PostType; postUrl: string; meetingId: string | null; caption: string };

export async function parsePostInput(
  ctx: SubmitterContext,
  body: Record<string, unknown>,
): Promise<{ ok: true; value: PostInput } | { ok: false; error: string }> {
  if (!isPostType(body.postType)) return { ok: false, error: '投稿の種類を選んでください' };
  const postUrl = cleanText(body.postUrl);
  const urlCheck = checkPostUrl(postUrl);
  if (urlCheck.error) return { ok: false, error: urlCheck.error };
  const caption = cleanText(body.caption);
  if (caption.length > LIMITS.caption) return { ok: false, error: `キャプション・メモは${LIMITS.caption}文字以内で入力してください` };
  const m = await checkMeeting(ctx, body.meetingId);
  if (!m.ok) return m;
  return { ok: true, value: { postType: body.postType, postUrl, meetingId: m.meetingId, caption } };
}
