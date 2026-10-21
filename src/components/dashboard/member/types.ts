/**
 * 会員ダッシュボード（/api/my/schedule のレスポンス）の型と、画面で使う小さな関数
 */
import { evaluateDeadline } from '@/lib/meetings/deadline';

export interface MyAttendance {
  id: string;
  participationType: string | null;
  note: string | null;
  isLateRegistration?: boolean | null;
}

export interface MyMeeting {
  id: string;
  title: string;
  meetingNumber: number | null;
  theme: string | null;
  committee: string | null;
  description: string | null;
  programDetail: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  venueAddress: string | null;
  status: string;
  registrationDeadline: string | null;
  deadlinePolicy?: string | null;
  finishedAt?: string | null;
  mealFee: number;
  muRegistrationUrl: string | null;
  muRegistrationSlug: string | null;
  feeRac: number;
  feeRc: number;
  feeObog: number;
  feeGuest: number;
  /** 自クラブ会員の登録料（null = 0円） */
  ownClubFee?: number | null;
  hasAfterParty: boolean;
  afterPartyVenue: string | null;
  afterPartyStartTime: string | null;
  afterPartyFeeType?: string | null;
  afterPartyFeeRac: number;
  afterPartyFeeRc: number;
  afterPartyFeeObog: number;
  afterPartyFeeGuest: number;
  capacity: number | null;
  kind: 'meeting';
  myAttendance: MyAttendance | null;
}

export interface DistrictEvent {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime?: string | null;
  venueName: string | null;
  venueAddress?: string | null;
  registrationFee?: number | null;
  registrationDeadline?: string | null;
  description?: string | null;
  eventType: string;
  isAwardTarget: boolean;
  kind: 'district_event';
}

export interface Stats {
  year: number;
  totalMeetings: number;
  pastMeetings: number;
  attendedCount: number;
  attendanceRate: number | null;
}

export interface Meta {
  clubName: string;
  memberType: string;
  fiscalYear: number;
}

export interface ScheduleResponse {
  meetings: MyMeeting[];
  districtEvents: DistrictEvent[];
  stats: Stats | null;
  meta: Meta | null;
}

export type ScheduleItem = MyMeeting | DistrictEvent;

export const PARTICIPATION_LABELS: Record<string, string> = {
  meeting_only: '例会のみ参加',
  meeting_and_party: '例会＋懇親会',
  party_only: '懇親会のみ',
  absent: '欠席',
  waitlist: 'キャンセル待ち',
};

/** 一覧・カレンダー用の短い表記 */
export const PARTICIPATION_SHORT: Record<string, string> = {
  meeting_only: '参加',
  meeting_and_party: '参加＋懇',
  party_only: '懇親会',
  absent: '欠席',
  waitlist: '待機',
};

export const PARTICIPATION_COLORS: Record<string, string> = {
  meeting_only: 'bg-blue-100 text-blue-700 border-blue-200',
  meeting_and_party: 'bg-purple-100 text-purple-700 border-purple-200',
  party_only: 'bg-pink-100 text-pink-700 border-pink-200',
  absent: 'bg-gray-100 text-gray-600 border-gray-200',
  waitlist: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

export const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

/** 端末の日付（日本で使う前提）を YYYY-MM-DD で返す。toISOString は UTC になるため使わない */
export function localYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
}

/** 7月始まりの年度 */
export function fiscalYearOf(ymd: string): number {
  const d = parseYmd(ymd);
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

/** 「11月28日（土）」 */
export function formatMonthDay(ymd: string): string {
  const d = parseYmd(ymd);
  return `${d.getMonth() + 1}月${d.getDate()}日（${DAYS_JA[d.getDay()]}）`;
}

export function hhmm(t: string | null | undefined): string {
  return t ? t.substring(0, 5) : '';
}

/** 例会の登録可否・遅延登録判定（締切ポリシー対応） */
export function checkDeadline(meeting: MyMeeting) {
  return evaluateDeadline({
    registrationDeadline: meeting.registrationDeadline ?? null,
    deadlinePolicy: meeting.deadlinePolicy ?? null,
    status: meeting.status ?? null,
    finishedAt: meeting.finishedAt ?? null,
    date: meeting.date ?? null,
  });
}

/**
 * 参加費（例会・懇親会）
 * 会員のトップページに出るのは自クラブの例会だけなので、例会の登録料は「自クラブ会員の登録料」（未設定なら0円）。
 * 懇親会費は会員区分ごと（MU登録フォームと同じ）。
 */
export function feesFor(meeting: MyMeeting, memberType: string) {
  const pick = (rac: number, rc: number, obog: number, guest: number) =>
    memberType === 'RAC' ? rac : memberType === 'RC' ? rc : memberType === 'OB_OG' ? obog : guest;
  return {
    meeting: meeting.ownClubFee ?? 0,
    party: pick(meeting.afterPartyFeeRac, meeting.afterPartyFeeRc, meeting.afterPartyFeeObog, meeting.afterPartyFeeGuest) || 0,
  };
}

/** 回答が必要な例会か（募集中・登録可能・未回答） */
export function needsAnswer(meeting: MyMeeting, today: string): boolean {
  if (meeting.date < today || meeting.status !== 'open' || meeting.myAttendance?.participationType) return false;
  return checkDeadline(meeting).allowed;
}
