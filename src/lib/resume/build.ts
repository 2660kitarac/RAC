/**
 * 例会レジュメの組み立て（サーバー専用）
 *
 * 例会・出席登録・会員・クラブ設定を集めて、画面と印刷の両方で使う ResumeView を作る。
 * レジュメ用の追加テーブルが未作成でも、既定値で表示できるようにしてある。
 */
import { and, asc, eq, gte, isNull, lte, ne } from 'drizzle-orm';
import {
  attendances,
  clubResumeSettings,
  clubs,
  meetingResumes,
  meetings,
  memberResumeProfiles,
  users,
} from '@/lib/db/schema';
import {
  DEFAULT_CLUB_SETTINGS,
  DEFAULT_PROGRAM_ITEMS,
  VISITOR_CATEGORY_ORDER,
  type ClubResumeSettings,
  type MemberMark,
  type ResumeData,
  type ResumeMember,
  type ResumeNextMeeting,
  type ResumeView,
  type ResumeVisitor,
  type VisitorCategory,
} from './types';
import {
  extractPosition,
  fiscalYearLabel,
  formatMonthDayWeek,
  formatTimeRange,
  monthOf,
  positionRank,
} from './format';

/** レジュメ用テーブルが未作成のときのエラーか（PostgreSQL: undefined_table） */
export function isMissingTable(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string }; message?: string };
  return (
    err?.code === '42P01' ||
    err?.cause?.code === '42P01' ||
    /relation .* does not exist/i.test(err?.message ?? '')
  );
}

/** 会員名簿に載せないアカウント種別（クラブ共用アカウント・システム管理者） */
const NON_MEMBER_ROLES = new Set(['club_account', 'club_admin', 'system_owner']);

/** 出席登録から、名簿の ○ / × / − を決める */
function markFromAttendance(a: { attendanceStatus: string | null; participationType: string | null } | undefined): MemberMark {
  if (!a) return 'none';
  const st = a.attendanceStatus ?? '';
  const pt = a.participationType ?? '';
  if (['present', 'late', 'early_leave'].includes(st)) return 'present';
  if (st === 'absent') return 'absent';
  if (pt === 'meeting_only' || pt === 'meeting_and_party') return 'present';
  if (pt === 'absent' || pt === 'party_only') return 'absent';
  return 'none';
}

/** 例会の参加者のうち、ビジター紹介に載せる区分を推定する */
function guessCategory(memberType: string | null): VisitorCategory {
  if (memberType === 'RC') return 'rc';
  if (memberType === 'RAC') return 'rac';
  return 'other';
}

/** 同じ月の例会の中で何番目か（中止・削除は数えない） */
function nthInMonth(
  target: { id: string; date: string },
  monthMeetings: Array<{ id: string; date: string; startTime: string | null }>,
): number {
  const ym = target.date.slice(0, 7);
  const list = monthMeetings
    .filter(m => m.date.slice(0, 7) === ym)
    .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
  const idx = list.findIndex(m => m.id === target.id);
  return idx >= 0 ? idx + 1 : 1;
}

/** 今後の例会の【内容】の既定文（説明の冒頭＋会場） */
function autoContent(description: string | null, venueName: string | null): string {
  const desc = (description ?? '').replace(/\s+/g, ' ').trim();
  const short = desc.length > 70 ? `${desc.slice(0, 70)}…` : desc;
  const venue = venueName ? `会場：${venueName}` : '';
  return [short, venue].filter(Boolean).join('　');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function buildResume(db: Db, meetingId: string): Promise<ResumeView | null> {
  // ---- 例会 ----
  const [meeting] = await db
    .select({
      id: meetings.id,
      clubId: meetings.clubId,
      title: meetings.title,
      theme: meetings.theme,
      date: meetings.date,
      startTime: meetings.startTime,
      endTime: meetings.endTime,
      meetingNumber: meetings.meetingNumber,
    })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), isNull(meetings.deletedAt)))
    .limit(1);
  if (!meeting) return null;

  // ---- クラブ ----
  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, district: clubs.district })
    .from(clubs)
    .where(eq(clubs.id, meeting.clubId))
    .limit(1);

  // ---- レジュメ用テーブル（未作成なら既定値で続行） ----
  let tablesMissing = false;
  let settings: ClubResumeSettings = { ...DEFAULT_CLUB_SETTINGS };
  let data: ResumeData = {};
  let profiles: Array<{
    userId: string;
    nameEn: string | null;
    committee: string | null;
    company: string | null;
    photoUrl: string | null;
  }> = [];

  try {
    const [s] = await db
      .select()
      .from(clubResumeSettings)
      .where(eq(clubResumeSettings.clubId, meeting.clubId))
      .limit(1);
    if (s) {
      settings = {
        headerLabel: s.headerLabel ?? DEFAULT_CLUB_SETTINGS.headerLabel,
        sponsorName: s.sponsorName ?? '',
        logoUrl: s.logoUrl ?? null,
        anthemTitle: s.anthemTitle ?? DEFAULT_CLUB_SETTINGS.anthemTitle,
        anthemText: s.anthemText ?? DEFAULT_CLUB_SETTINGS.anthemText,
        songTitle: s.songTitle ?? DEFAULT_CLUB_SETTINGS.songTitle,
        songText: s.songText ?? '',
      };
    }

    const [r] = await db
      .select({ data: meetingResumes.data })
      .from(meetingResumes)
      .where(eq(meetingResumes.meetingId, meeting.id))
      .limit(1);
    if (r?.data && typeof r.data === 'object') data = r.data as ResumeData;

    profiles = await db
      .select({
        userId: memberResumeProfiles.userId,
        nameEn: memberResumeProfiles.nameEn,
        committee: memberResumeProfiles.committee,
        company: memberResumeProfiles.company,
        photoUrl: memberResumeProfiles.photoUrl,
      })
      .from(memberResumeProfiles)
      .where(eq(memberResumeProfiles.clubId, meeting.clubId));
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    tablesMissing = true;
  }

  // ---- 回次の計算用に、この月〜半年先のクラブ例会を取る ----
  const monthStart = `${meeting.date.slice(0, 7)}-01`;
  const rangeEnd = (() => {
    const d = new Date(`${monthStart}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const clubMeetings: Array<{
    id: string;
    title: string;
    date: string;
    startTime: string | null;
    description: string | null;
    venueName: string | null;
  }> = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      date: meetings.date,
      startTime: meetings.startTime,
      description: meetings.description,
      venueName: meetings.venueName,
    })
    .from(meetings)
    .where(
      and(
        eq(meetings.clubId, meeting.clubId),
        isNull(meetings.deletedAt),
        ne(meetings.status, 'cancelled'),
        gte(meetings.date, monthStart),
        lte(meetings.date, rangeEnd),
      ),
    )
    .orderBy(asc(meetings.date), asc(meetings.startTime));

  // ---- 見出しまわり ----
  const month = monthOf(meeting.date);
  const nth = nthInMonth(meeting, clubMeetings);
  const autoSession = `${month}月度 第${nth}例会`;
  const dateTimeLabel = [formatMonthDayWeek(meeting.date), formatTimeRange(meeting.startTime, meeting.endTime)]
    .filter(Boolean)
    .join(' ');

  const defaults = {
    yearLabel: fiscalYearLabel(meeting.date),
    sessionLabel: autoSession,
    title: meeting.theme?.trim() || meeting.title,
    programItems: DEFAULT_PROGRAM_ITEMS,
    dateTimeLabel,
  };

  const sessionLabel = data.sessionLabel?.trim() || defaults.sessionLabel;
  const headerLine = [
    meeting.meetingNumber ? `第${meeting.meetingNumber}回` : '',
    sessionLabel,
    dateTimeLabel,
  ]
    .filter(Boolean)
    .join(' ');

  // ---- 出席登録（会員の出欠とビジター紹介の両方に使う） ----
  const attendanceRows: Array<{
    id: string;
    userId: string | null;
    externalName: string | null;
    clubName: string | null;
    memberType: string | null;
    registrationType: string | null;
    participationType: string | null;
    attendanceStatus: string | null;
    note: string | null;
    userName: string | null;
    userClubId: string | null;
    registeredAt: string | null;
  }> = await db
    .select({
      id: attendances.id,
      userId: attendances.userId,
      externalName: attendances.externalName,
      clubName: attendances.clubName,
      memberType: attendances.memberType,
      registrationType: attendances.registrationType,
      participationType: attendances.participationType,
      attendanceStatus: attendances.attendanceStatus,
      note: attendances.note,
      userName: users.name,
      userClubId: users.clubId,
      registeredAt: attendances.registeredAt,
    })
    .from(attendances)
    .leftJoin(users, eq(attendances.userId, users.id))
    .where(and(eq(attendances.meetingId, meeting.id), isNull(attendances.deletedAt)))
    .orderBy(asc(attendances.registeredAt));

  // 名簿に載るのは自クラブの RAC 会員だけ。自クラブの OB・OG 等はビジター（その他）に回す
  const isOwnMember = (a: (typeof attendanceRows)[number]) =>
    !!a.userId && a.userClubId === meeting.clubId && a.registrationType !== 'mu' && a.memberType === 'RAC';

  // ---- ビジター紹介 ----
  const overrides = data.visitorOverrides ?? {};
  const autoVisitors: ResumeVisitor[] = attendanceRows
    .filter(a => !isOwnMember(a))
    // 例会に来る人だけ（懇親会のみ・欠席・キャンセル待ちは載せない）
    .filter(a => ['meeting_only', 'meeting_and_party'].includes(a.participationType ?? 'meeting_only'))
    .filter(a => a.attendanceStatus !== 'absent')
    .map(a => {
      const o = overrides[a.id] ?? {};
      return {
        key: a.id,
        attendanceId: a.id,
        category: o.category ?? guessCategory(a.memberType),
        clubName: o.clubName ?? a.clubName ?? '',
        position: o.position ?? extractPosition(a.note),
        name: o.name ?? a.externalName ?? a.userName ?? '',
        hidden: !!o.hidden,
      };
    });
  const extraVisitors: ResumeVisitor[] = (data.extraVisitors ?? []).map(v => ({
    key: v.id,
    attendanceId: null,
    category: v.category,
    clubName: v.clubName,
    position: v.position,
    name: v.name,
    hidden: false,
  }));
  const visitors = [...autoVisitors, ...extraVisitors].sort(
    (a, b) => VISITOR_CATEGORY_ORDER.indexOf(a.category) - VISITOR_CATEGORY_ORDER.indexOf(b.category),
  );

  // ---- 幹事連絡（今後の例会） ----
  const count = Math.max(0, Math.min(4, data.nextMeetingCount ?? 2));
  const nmOverrides = data.nextMeetingOverrides ?? {};
  const upcoming = clubMeetings
    .filter(m => m.id !== meeting.id)
    .filter(m => m.date > meeting.date || (m.date === meeting.date && (m.startTime ?? '') > (meeting.startTime ?? '')));
  const nextMeetings: ResumeNextMeeting[] = [];
  for (const m of upcoming) {
    if (nextMeetings.filter(x => !x.hidden).length >= count) break;
    const o = nmOverrides[m.id] ?? {};
    const autoC = autoContent(m.description, m.venueName);
    const item: ResumeNextMeeting = {
      id: m.id,
      label: `${monthOf(m.date)}月 第${nthInMonth(m, clubMeetings)}例会`,
      dateLabel: formatMonthDayWeek(m.date, true),
      title: o.title?.trim() || m.title,
      content: o.content?.trim() ? o.content : autoC,
      autoTitle: m.title,
      autoContent: autoC,
      hidden: !!o.hidden,
    };
    nextMeetings.push(item);
  }

  // ---- 会員名簿 ----
  const memberRows: Array<{
    id: string;
    name: string;
    nameKana: string | null;
    position: string | null;
    occupation: string | null;
    role: string;
    joinedAt: string | null;
  }> = await db
    .select({
      id: users.id,
      name: users.name,
      nameKana: users.nameKana,
      position: users.position,
      occupation: users.occupation,
      role: users.role,
      joinedAt: users.joinedAt,
    })
    .from(users)
    .where(
      and(
        eq(users.clubId, meeting.clubId),
        isNull(users.deletedAt),
        eq(users.status, 'active'),
        eq(users.isActive, true),
        eq(users.memberType, 'RAC'),
      ),
    );

  const profileMap = new Map(profiles.map(p => [p.userId, p]));
  const attendanceByUser = new Map(
    attendanceRows.filter(a => a.userId).map(a => [a.userId as string, a]),
  );
  const markOverrides = data.memberMarkOverrides ?? {};

  const members: ResumeMember[] = memberRows
    .filter(u => !NON_MEMBER_ROLES.has(u.role))
    .sort((a, b) => {
      const r = positionRank(a.position) - positionRank(b.position);
      if (r !== 0) return r;
      const j = (a.joinedAt ?? '9999').localeCompare(b.joinedAt ?? '9999');
      if (j !== 0) return j;
      return (a.nameKana ?? a.name).localeCompare(b.nameKana ?? b.name, 'ja');
    })
    .map(u => {
      const p = profileMap.get(u.id);
      const autoMark = markFromAttendance(attendanceByUser.get(u.id));
      return {
        userId: u.id,
        name: u.name,
        nameEn: p?.nameEn ?? '',
        position: u.position ?? '',
        committee: p?.committee ?? '',
        company: p?.company?.trim() || u.occupation || '',
        companySaved: p?.company ?? '',
        occupation: u.occupation ?? '',
        photoUrl: p?.photoUrl ?? null,
        autoMark,
        mark: markOverrides[u.id] ?? autoMark,
      };
    });

  const presentCount = members.filter(m => m.mark === 'present').length;

  return {
    meeting: {
      id: meeting.id,
      clubId: meeting.clubId,
      title: meeting.title,
      theme: meeting.theme,
      date: meeting.date,
      meetingNumber: meeting.meetingNumber,
    },
    club: { id: club?.id ?? meeting.clubId, name: club?.name ?? '', district: club?.district ?? null },
    settings,
    data,
    defaults,
    headerLine,
    sessionLabel,
    yearLabel: data.yearLabel?.trim() || defaults.yearLabel,
    title: data.title?.trim() || defaults.title,
    programItems:
      data.programItems && data.programItems.filter(s => s.trim()).length > 0
        ? data.programItems.filter(s => s.trim())
        : defaults.programItems,
    showSongs: data.showSongs ?? true,
    visitors,
    nextMeetings,
    secretaryNote: data.secretaryNote ?? '',
    showAttendance: data.showAttendance ?? true,
    members,
    stats: {
      memberCount: members.length,
      presentCount,
      rate: members.length > 0 ? Math.round((presentCount / members.length) * 1000) / 10 : null,
    },
    tablesMissing,
  };
}
