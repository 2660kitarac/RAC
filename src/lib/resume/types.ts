/**
 * 例会レジュメの型定義
 * サーバー（組み立て・保存）とクライアント（編集画面・プレビュー）の両方から使う
 */

/** ビジター紹介の区分 */
export type VisitorCategory = 'rc' | 'district' | 'rac' | 'other';

export const VISITOR_CATEGORY_ORDER: VisitorCategory[] = ['rc', 'district', 'rac', 'other'];

/** 会員名簿の出欠マーク */
export type MemberMark = 'present' | 'absent' | 'none';

/** 例会ごとに保存する内容（meeting_resumes.data） */
export interface ResumeData {
  /** 年度表記（未入力なら例会日から自動: 2026-2027年度） */
  yearLabel?: string;
  /** 回次の補足（未入力なら自動: 9月度 第2例会） */
  sessionLabel?: string;
  /** 大見出し（未入力なら例会のテーマ → 例会名） */
  title?: string;
  /** 本日のプログラム（1行1項目） */
  programItems?: string[];
  /** 国歌・ソングを載せるか（既定: 載せる） */
  showSongs?: boolean;
  /** 自動で拾ったビジターの修正（キー: 出席登録ID） */
  visitorOverrides?: Record<
    string,
    { category?: VisitorCategory; clubName?: string; position?: string; name?: string; hidden?: boolean }
  >;
  /** 手入力で追加したビジター */
  extraVisitors?: Array<{
    id: string;
    category: VisitorCategory;
    clubName: string;
    position: string;
    name: string;
  }>;
  /** 幹事連絡に載せる今後の例会の件数（既定: 2） */
  nextMeetingCount?: number;
  /** 今後の例会の表示を手直し（キー: 例会ID） */
  nextMeetingOverrides?: Record<string, { title?: string; content?: string; hidden?: boolean }>;
  /** 幹事連絡の自由記入欄 */
  secretaryNote?: string;
  /** 会員名簿に出欠を出すか（既定: 出す） */
  showAttendance?: boolean;
  /** 会員の出欠を手で直す（キー: ユーザーID） */
  memberMarkOverrides?: Record<string, MemberMark>;
}

/** クラブ共通設定（club_resume_settings） */
export interface ClubResumeSettings {
  headerLabel: string;
  sponsorName: string;
  logoUrl: string | null;
  anthemTitle: string;
  anthemText: string;
  songTitle: string;
  songText: string;
}

/** 会員名簿用プロフィール（member_resume_profiles） */
export interface MemberProfileInput {
  userId: string;
  nameEn: string;
  committee: string;
  company: string;
  photoUrl: string | null;
}

/** 印刷・プレビュー用に組み立て済みのビジター */
export interface ResumeVisitor {
  key: string;
  /** 自動取得分なら出席登録ID、手入力分は null */
  attendanceId: string | null;
  category: VisitorCategory;
  clubName: string;
  position: string;
  name: string;
  hidden: boolean;
}

/** 印刷・プレビュー用に組み立て済みの会員 */
export interface ResumeMember {
  userId: string;
  name: string;
  nameEn: string;
  position: string;
  committee: string;
  /** 表示する勤務先（保存値が空なら会員情報の「会社・学校名」） */
  company: string;
  /** レジュメ用に保存した勤務先（空なら未入力） */
  companySaved: string;
  /** 会員情報の「会社・学校名」 */
  occupation: string;
  photoUrl: string | null;
  /** 出席登録から自動で判定したマーク */
  autoMark: MemberMark;
  /** 手直しを反映した最終マーク */
  mark: MemberMark;
}

/** 幹事連絡に載せる今後の例会 */
export interface ResumeNextMeeting {
  id: string;
  label: string; // 例: 10月 第1例会
  dateLabel: string; // 例: 10月8日（木）
  title: string;
  content: string;
  autoTitle: string;
  autoContent: string;
  hidden: boolean;
}

/** 画面・印刷に渡す組み立て済みのレジュメ一式 */
export interface ResumeView {
  meeting: {
    id: string;
    clubId: string;
    title: string;
    theme: string | null;
    date: string;
    meetingNumber: number | null;
  };
  club: { id: string; name: string; district: string | null };
  settings: ClubResumeSettings;
  /** 保存済みの内容（未保存なら空） */
  data: ResumeData;
  /** 自動計算した既定値（編集画面のプレースホルダーに使う） */
  defaults: {
    yearLabel: string;
    sessionLabel: string;
    title: string;
    programItems: string[];
    dateTimeLabel: string;
  };
  /** 反映済みの表示値 */
  headerLine: string; // 第1393回 9月度 第2例会 9月15日(月) 19:30ー20:30（60分）
  sessionLabel: string; // 9月度 第2例会
  yearLabel: string;
  title: string;
  programItems: string[];
  showSongs: boolean;
  visitors: ResumeVisitor[];
  nextMeetings: ResumeNextMeeting[];
  secretaryNote: string;
  showAttendance: boolean;
  members: ResumeMember[];
  stats: { memberCount: number; presentCount: number; rate: number | null };
  /** 追加テーブルが未作成（マイグレーション未適用） */
  tablesMissing: boolean;
}

export const VISITOR_CATEGORY_LABELS: Record<VisitorCategory, string> = {
  rc: 'ロータリークラブ',
  district: '地区',
  rac: 'ローターアクトクラブ',
  other: 'ゲスト・その他',
};

/** 本日のプログラムの初期値（一般的な例会次第） */
export const DEFAULT_PROGRAM_ITEMS = [
  '開会点鐘',
  '国歌・ローターアクトソング斉唱',
  'ビジター紹介',
  '会長挨拶',
  'メインプログラム',
  '諸事連絡・幹事連絡',
  '講評',
  '閉会点鐘・集合写真',
];

/** クラブ共通設定の初期値 */
export const DEFAULT_CLUB_SETTINGS: ClubResumeSettings = {
  headerLabel: '国際ロータリー第2660地区ローターアクト',
  sponsorName: '',
  logoUrl: null,
  anthemTitle: '君が代',
  // 古歌（著作権保護期間外）のため初期値として持つ
  anthemText: '君が代は　千代に八千代に\nさざれ石の　巌となりて\n苔のむすまで',
  songTitle: 'ローターアクトソング',
  // 歌詞は各クラブで貼り付けてもらう（初期値は持たない）
  songText: '',
};
