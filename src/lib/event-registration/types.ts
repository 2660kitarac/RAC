/**
 * 地区行事の申込フォーム（登録申込）の型定義
 * サーバー（API）と画面（申込フォーム・地区役員の管理画面）の両方から使う。
 */

/** 参加の枠（例：情報交換会／交流会／懇親会、本体／懇親会） */
export interface FormSession {
  key: string;
  name: string;
  /** 料金がかかる枠か（料金方式が「区分ごとに一律」のとき、この枠に参加すると登録料が発生） */
  charged: boolean;
}

/** 参加者の区分（例：RC／RAC／OB・OG／ゲスト） */
export interface FormCategory {
  key: string;
  name: string;
  /** 料金方式 per_person のときの1人あたり登録料 */
  fee: number;
  /** 料金方式 per_session のときの枠ごとの料金（キー: FormSession.key） */
  sessionFees: Record<string, number>;
}

/**
 * 物販・協賛の項目
 *  - quantity: 数量で申し込む（例：マフラータオル 2,000円／枚）
 *  - named:    1件ごとに種類と記載名を入れる（例：ペナント協賛 個人10,000円／団体15,000円）
 */
export interface FormItem {
  key: string;
  name: string;
  kind: 'quantity' | 'named';
  /** quantity のときの単価 */
  price: number;
  /** named のときの種類と金額 */
  options: Array<{ key: string; label: string; price: number }>;
  /** named のとき「記載名」を必須にするか */
  requireLabel: boolean;
  description: string;
}

/**
 * 料金方式
 *  - per_person:  区分ごとの登録料を、料金がかかる枠に1つでも参加した人数分（例：関西四地区 交流会のみ・懇親会のみでも同額）
 *  - per_session: 区分×枠ごとの料金を合計
 *  - per_club:    申込（クラブ）ごとに一律（例：スポGOMI 各クラブ一律10,000円）
 */
export type FeeMode = 'per_person' | 'per_session' | 'per_club';

/** 参加者ごとに聞く項目 */
export interface AttendeeFieldSettings {
  kana: boolean;
  position: boolean;
  /** 参加者ごとの所属クラブ（RCの方などをまとめて申し込む場合） */
  club: boolean;
  under20: boolean;
  /** 備考欄の見出し（例：備考（アレルギー・遅参など）） */
  noteLabel: string;
}

export type FormStatus = 'draft' | 'open' | 'closed';

/** フォーム設定（管理画面で編集する内容） */
export interface RegistrationFormConfig {
  title: string;
  eventDate: string | null;
  venue: string;
  /** 案内文（申込ページの上部に表示） */
  description: string;
  deadline: string | null;
  paymentDeadline: string | null;
  bankInfo: string;
  contact: string;
  /** 申込・修正のたびに通知するメールアドレス（任意） */
  notifyEmail: string;
  status: FormStatus;
  /** 地区外（他地区・学友会など）の申込を受け付けるか */
  allowOtherDistricts: boolean;
  feeMode: FeeMode;
  /** per_club のときの1申込あたりの金額 */
  clubFee: number;
  sessions: FormSession[];
  categories: FormCategory[];
  items: FormItem[];
  attendeeFields: AttendeeFieldSettings;
}

/** 参加者1人分 */
export interface RegistrationAttendee {
  id: string;
  lastName: string;
  firstName: string;
  lastKana: string;
  firstKana: string;
  clubName: string;
  position: string;
  category: string; // FormCategory.key
  under20: boolean;
  sessions: Record<string, boolean>; // FormSession.key → 参加
  note: string;
}

/** 申込の物販・協賛の内容 */
export interface RegistrationItems {
  quantities: Record<string, number>; // quantity 項目: key → 数量
  named: Array<{ id: string; itemKey: string; optionKey: string; buyerName: string; label: string }>;
}

/** 申込者が入力する内容 */
export interface RegistrationInput {
  districtName: string;
  clubId: string | null;
  clubName: string;
  registrantName: string;
  registrantEmail: string;
  registrantPhone: string;
  message: string; // 諸事連絡
  attendees: RegistrationAttendee[];
  items: RegistrationItems;
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

/** 金額の内訳 */
export interface FeeBreakdown {
  registrationFee: number;
  itemsFee: number;
  total: number;
  /** 参加者ごとの登録料（キー: RegistrationAttendee.id） */
  perAttendee: Record<string, number>;
  /** 物販・協賛の内訳 */
  itemLines: Array<{ name: string; detail: string; amount: number }>;
}

export const DEFAULT_ATTENDEE_FIELDS: AttendeeFieldSettings = {
  kana: true,
  position: true,
  club: false,
  under20: false,
  noteLabel: '備考（アレルギー・遅参など）',
};

/** ひな形：関西四地区のような「区分×参加枠」の行事 */
export function templateBySession(): Partial<RegistrationFormConfig> {
  return {
    feeMode: 'per_person',
    clubFee: 0,
    sessions: [
      { key: 's1', name: '情報交換会', charged: false },
      { key: 's2', name: '交流会', charged: true },
      { key: 's3', name: '懇親会', charged: true },
    ],
    categories: [
      { key: 'RC', name: 'ロータリークラブ', fee: 20000, sessionFees: {} },
      { key: 'RAC', name: 'ローターアクトクラブ', fee: 10000, sessionFees: {} },
      { key: 'OBOG', name: 'OB・OG／学友／その他ゲスト', fee: 13000, sessionFees: {} },
    ],
    items: [],
    attendeeFields: { kana: true, position: true, club: true, under20: true, noteLabel: '備考（アレルギー・遅参など）' },
  };
}

/** ひな形：スポGOMIのような「クラブ一律＋グッズ・協賛」の行事 */
export function templateClubFlat(): Partial<RegistrationFormConfig> {
  return {
    feeMode: 'per_club',
    clubFee: 10000,
    sessions: [
      { key: 's1', name: '本体', charged: false },
      { key: 's2', name: '懇親会', charged: false },
    ],
    categories: [{ key: 'RAC', name: 'ローターアクター', fee: 0, sessionFees: {} }],
    items: [
      { key: 'towel', name: 'オリジナルマフラータオル', kind: 'quantity', price: 2000, options: [], requireLabel: false, description: '' },
      {
        key: 'pennant',
        name: 'ペナント協賛',
        kind: 'named',
        price: 0,
        options: [
          { key: 'personal', label: '個人', price: 10000 },
          { key: 'group', label: 'クラブ・法人', price: 15000 },
        ],
        requireLabel: true,
        description: 'ペナントに記載する名前（企業名・クラブ名など）を入れてください',
      },
    ],
    attendeeFields: { kana: true, position: true, club: false, under20: false, noteLabel: '備考' },
  };
}

export const FEE_MODE_LABELS: Record<FeeMode, string> = {
  per_person: '区分ごとに一律（料金がかかる枠に1つでも参加すれば登録料）',
  per_session: '区分×参加枠ごとに料金を合計',
  per_club: 'クラブ（申込）ごとに一律',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: '未入金',
  partial: '一部入金',
  paid: '入金済',
};
