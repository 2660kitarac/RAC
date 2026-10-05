/**
 * 管理画面（申込ダッシュボード）で扱うデータの型
 * GET /api/district/registration-forms/[id] の返り値に合わせる。
 */
import type { PaymentStatus, RegistrationFormConfig, RegistrationInput } from '@/lib/event-registration/types';

export interface RegistrationRow {
  id: string;
  formId: string;
  editToken: string;
  districtName: string | null;
  clubId: string | null;
  clubName: string;
  registrantName: string;
  registrantEmail: string;
  registrantPhone: string | null;
  data: RegistrationInput;
  attendeeCount: number;
  registrationFee: number;
  itemsFee: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  paidAt: string | null;
  paymentNote: string | null;
  adminNote: string | null;
  status: 'submitted' | 'cancelled' | string;
  submittedAt: string;
  updatedAt: string;
}

export interface LogRow {
  id?: string;
  action: string;
  actor: string | null;
  detail: string | null;
  createdAt: string;
}

export interface ClubOption {
  id: string;
  name: string;
  shortName: string | null;
  type: string;
}

export interface DashboardData {
  form: { id: string; slug: string; config: RegistrationFormConfig; updatedAt: string };
  registrations: RegistrationRow[];
  logs: LogRow[];
  districtName: string;
  clubs: ClubOption[];
}

/** 申込内容（古いデータでも落ちないよう空の値で補う） */
export function inputOf(r: RegistrationRow): RegistrationInput {
  const d = (r.data ?? {}) as Partial<RegistrationInput>;
  return {
    districtName: d.districtName ?? r.districtName ?? '',
    clubId: d.clubId ?? r.clubId,
    clubName: d.clubName ?? r.clubName,
    registrantName: d.registrantName ?? r.registrantName,
    registrantEmail: d.registrantEmail ?? r.registrantEmail,
    registrantPhone: d.registrantPhone ?? r.registrantPhone ?? '',
    message: d.message ?? '',
    attendees: Array.isArray(d.attendees) ? d.attendees : [],
    items: {
      quantities: d.items?.quantities ?? {},
      named: Array.isArray(d.items?.named) ? d.items.named : [],
    },
  };
}

/** 操作履歴の種類（日本語） */
export const LOG_ACTION_LABELS: Record<string, string> = {
  form_created: 'フォーム作成',
  form_updated: '設定変更',
  form_deleted: 'フォーム削除',
  created: '新規申込',
  updated: '申込者が修正',
  cancelled: '申込者が取り消し',
  admin_created: '代理入力',
  admin_edit: '役員が内容を修正',
  admin_update: '役員が更新',
  payment: '入金確認',
};
