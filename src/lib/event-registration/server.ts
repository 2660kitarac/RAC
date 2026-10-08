/**
 * 地区行事の申込フォーム：サーバー専用の処理
 *  - 設定・申込内容の整形（受け取った JSON を想定した形だけに絞る）
 *  - 地区役員の権限確認
 *  - 操作履歴の記録・控えメールの送信
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubs, districts, eventRegistrationLogs, registrationForms, users } from '@/lib/db/schema';
import { isDistrictStaff } from '@/lib/auth/tenant';
import { attendeeName, calcFees } from './calc';
import {
  DEFAULT_ATTENDEE_FIELDS,
  type FeeMode,
  type FormStatus,
  type RegistrationAttendee,
  type RegistrationFormConfig,
  type RegistrationInput,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v: unknown, min = 0, max = 10_000_000): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const key = (v: unknown, fallback: string): string => {
  const s = str(v, 40).replace(/[^A-Za-z0-9_-]/g, '');
  return s || fallback;
};
const date = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function newId(): string {
  return randomUUID();
}

/** 修正用リンクの鍵（推測されない長さ） */
export function newEditToken(): string {
  return randomBytes(24).toString('base64url');
}

/** 申込URLの末尾（短く、紛らわしい文字を使わない） */
export function newSlug(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/** 管理画面から受け取ったフォーム設定を整形する */
export function sanitizeConfig(input: unknown): RegistrationFormConfig {
  const c = (input ?? {}) as Record<string, unknown>;
  const feeMode: FeeMode = ['per_person', 'per_session', 'per_club'].includes(c.feeMode as string)
    ? (c.feeMode as FeeMode)
    : 'per_person';
  const status: FormStatus = ['draft', 'open', 'closed'].includes(c.status as string) ? (c.status as FormStatus) : 'draft';

  const sessions = (Array.isArray(c.sessions) ? c.sessions : []).slice(0, 10).map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return { key: key(o.key, `s${i + 1}`), name: str(o.name, 50) || `枠${i + 1}`, charged: o.charged === true };
  });
  // キーの重複をなくす
  const seen = new Set<string>();
  for (const s of sessions) {
    while (seen.has(s.key)) s.key = `${s.key}_`;
    seen.add(s.key);
  }

  const categories = (Array.isArray(c.categories) ? c.categories : []).slice(0, 15).map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const sf = (o.sessionFees ?? {}) as Record<string, unknown>;
    return {
      key: key(o.key, `c${i + 1}`),
      name: str(o.name, 50) || `区分${i + 1}`,
      fee: int(o.fee),
      sessionFees: Object.fromEntries(sessions.map(s => [s.key, int(sf[s.key])])),
    };
  });
  const seenC = new Set<string>();
  for (const x of categories) {
    while (seenC.has(x.key)) x.key = `${x.key}_`;
    seenC.add(x.key);
  }

  const items = (Array.isArray(c.items) ? c.items : []).slice(0, 10).map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const kind = o.kind === 'named' ? 'named' : 'quantity';
    return {
      key: key(o.key, `i${i + 1}`),
      name: str(o.name, 60) || `項目${i + 1}`,
      kind: kind as 'named' | 'quantity',
      price: int(o.price),
      options: (Array.isArray(o.options) ? o.options : []).slice(0, 10).map((p, j) => {
        const q = (p ?? {}) as Record<string, unknown>;
        return { key: key(q.key, `o${j + 1}`), label: str(q.label, 40) || `種類${j + 1}`, price: int(q.price) };
      }),
      requireLabel: o.requireLabel === true,
      description: str(o.description, 300),
    };
  });

  const seenI = new Set<string>();
  for (const x of items) {
    while (seenI.has(x.key)) x.key = `${x.key}_`;
    seenI.add(x.key);
    const seenO = new Set<string>();
    for (const o of x.options) {
      while (seenO.has(o.key)) o.key = `${o.key}_`;
      seenO.add(o.key);
    }
  }

  const af = (c.attendeeFields ?? {}) as Record<string, unknown>;
  return {
    title: str(c.title, 120) || '（名称未設定の行事）',
    eventDate: date(c.eventDate),
    venue: str(c.venue, 300),
    description: str(c.description, 8000),
    deadline: date(c.deadline),
    paymentDeadline: date(c.paymentDeadline),
    bankInfo: str(c.bankInfo, 1000),
    contact: str(c.contact, 1000),
    notifyEmail: str(c.notifyEmail, 200).trim(),
    status,
    allowOtherDistricts: c.allowOtherDistricts === true,
    feeMode,
    clubFee: int(c.clubFee),
    sessions,
    categories,
    items,
    attendeeFields: {
      kana: af.kana === undefined ? DEFAULT_ATTENDEE_FIELDS.kana : af.kana === true,
      position: af.position === undefined ? DEFAULT_ATTENDEE_FIELDS.position : af.position === true,
      club: af.club === true,
      under20: af.under20 === true,
      noteLabel: str(af.noteLabel, 60) || DEFAULT_ATTENDEE_FIELDS.noteLabel,
    },
  };
}

/** 申込者から受け取った内容を整形する（フォーム設定にない区分・枠・項目は捨てる） */
export function sanitizeInput(input: unknown, config: RegistrationFormConfig): RegistrationInput {
  const d = (input ?? {}) as Record<string, unknown>;
  const sessionKeys = new Set(config.sessions.map(s => s.key));
  const categoryKeys = new Set(config.categories.map(c => c.key));

  // IDは画面側で振ったものを使うが、空・重複していればサーバーで振り直す
  const usedIds = new Set<string>();
  const uniqueId = (v: unknown) => {
    let id = str(v, 64);
    if (!id || usedIds.has(id)) id = newId();
    usedIds.add(id);
    return id;
  };
  const attendees: RegistrationAttendee[] = (Array.isArray(d.attendees) ? d.attendees : []).slice(0, 200).map(x => {
    const a = (x ?? {}) as Record<string, unknown>;
    const ss = (a.sessions ?? {}) as Record<string, unknown>;
    const category = str(a.category, 40);
    return {
      id: uniqueId(a.id),
      lastName: str(a.lastName, 40).trim(),
      firstName: str(a.firstName, 40).trim(),
      lastKana: str(a.lastKana, 40).trim(),
      firstKana: str(a.firstKana, 40).trim(),
      clubName: str(a.clubName, 60).trim(),
      position: str(a.position, 60).trim(),
      category: categoryKeys.has(category) ? category : '',
      under20: a.under20 === true,
      sessions: Object.fromEntries([...sessionKeys].map(k => [k, ss[k] === true])),
      note: str(a.note, 300).trim(),
    };
  });

  const it = (d.items ?? {}) as Record<string, unknown>;
  const q = (it.quantities ?? {}) as Record<string, unknown>;
  const quantities: Record<string, number> = {};
  for (const item of config.items.filter(i => i.kind === 'quantity')) {
    const n = int(q[item.key], 0, 1000);
    if (n > 0) quantities[item.key] = n;
  }
  const namedKeys = new Set(config.items.filter(i => i.kind === 'named').map(i => i.key));
  const named = (Array.isArray(it.named) ? it.named : []).slice(0, 100).map(x => {
    const n = (x ?? {}) as Record<string, unknown>;
    return {
      id: uniqueId(n.id),
      itemKey: str(n.itemKey, 40),
      optionKey: str(n.optionKey, 40),
      buyerName: str(n.buyerName, 60).trim(),
      label: str(n.label, 100).trim(),
    };
  }).filter(n => namedKeys.has(n.itemKey));

  return {
    districtName: str(d.districtName, 60).trim(),
    clubId: typeof d.clubId === 'string' && d.clubId ? d.clubId.slice(0, 64) : null,
    clubName: str(d.clubName, 80).trim(),
    registrantName: str(d.registrantName, 60).trim(),
    registrantEmail: str(d.registrantEmail, 200).trim(),
    registrantPhone: str(d.registrantPhone, 30).trim(),
    message: str(d.message, 2000).trim(),
    attendees,
    items: { quantities, named },
  };
}

/** 申込を保存するときの集計列 */
export function summaryColumns(config: RegistrationFormConfig, input: RegistrationInput) {
  const fees = calcFees(config, input);
  return {
    attendeeCount: input.attendees.length,
    registrationFee: fees.registrationFee,
    itemsFee: fees.itemsFee,
    totalAmount: fees.total,
  };
}

/**
 * 地区役員としてログインしているか確認し、担当地区を返す。
 * 地区スタッフ（system_owner / district_admin / 地区代表 / 地区幹事）なら、
 * 誰か1人に業務が集中しないよう、同じ地区のフォームを全員が扱える。
 */
export async function requireDistrictStaff(): Promise<
  | { ok: true; db: Db; user: { id: string; name: string; role: string }; districtId: string | null }
  | { ok: false; status: number; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401, error: 'ログインしてください' };
  const db = await getDbFromContext();
  const [me] = await db
    .select({ id: users.id, name: users.name, role: users.role, clubId: users.clubId, districtId: users.districtId })
    .from(users)
    // 無効化・却下されたアカウントは古いセッションでも操作させない
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt), eq(users.isActive, true), eq(users.status, 'active')))
    .limit(1);
  if (!me || !isDistrictStaff(me.role)) return { ok: false, status: 403, error: '地区役員のみ利用できます' };

  let districtId: string | null = me.districtId ?? null;
  if (!districtId && me.clubId) {
    const [c] = await db.select({ districtId: clubs.districtId }).from(clubs).where(eq(clubs.id, me.clubId)).limit(1);
    districtId = c?.districtId ?? null;
  }
  if (!districtId) {
    // 地区が1つだけの運用なら、その地区とみなす（複数ある場合は推測しない）
    const ds = await db.select({ id: districts.id }).from(districts).where(isNull(districts.deletedAt)).limit(2);
    districtId = ds.length === 1 ? ds[0].id : null;
  }
  return { ok: true, db, user: { id: me.id, name: me.name, role: me.role }, districtId };
}

/** 操作履歴を残す（失敗しても本処理は止めない） */
export async function logAction(
  db: Db,
  entry: { formId: string; registrationId?: string | null; action: string; actor?: string | null; detail?: string | null },
) {
  try {
    await db.insert(eventRegistrationLogs).values({
      id: newId(),
      formId: entry.formId,
      registrationId: entry.registrationId ?? null,
      action: entry.action,
      actor: entry.actor ?? null,
      detail: entry.detail?.slice(0, 1000) ?? null,
    });
  } catch (e) {
    console.error('event_registration_logs insert failed:', e);
  }
}

/** アプリのURL（メール・画面に出す申込URLの組み立て用） */
export function appBaseUrl(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (env) return env;
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

/** 申込内容のテキスト（控えメール・通知メール用） */
export function registrationText(config: RegistrationFormConfig, input: RegistrationInput): string {
  const fees = calcFees(config, input);
  const lines: string[] = [];
  lines.push(`■ ${config.title}`);
  if (input.districtName) lines.push(`地区：${input.districtName}`);
  lines.push(`クラブ：${input.clubName}`);
  lines.push(`登録責任者：${input.registrantName}（${input.registrantEmail}${input.registrantPhone ? ` / ${input.registrantPhone}` : ''}）`);
  lines.push('');
  lines.push(`【参加者 ${input.attendees.length}名】`);
  input.attendees.forEach((a, i) => {
    const cat = config.categories.find(c => c.key === a.category)?.name ?? '';
    const ss = config.sessions.filter(s => a.sessions[s.key]).map(s => s.name).join('・');
    lines.push(`${i + 1}. ${attendeeName(a)}${a.position ? `（${a.position}）` : ''} ${cat} ${ss ? `[${ss}]` : ''}`);
  });
  if (fees.itemLines.length > 0) {
    lines.push('');
    lines.push('【物販・協賛】');
    fees.itemLines.forEach(l => lines.push(`${l.name}：${l.detail} = ${l.amount.toLocaleString()}円`));
    for (const n of input.items.named) {
      const item = config.items.find(i => i.key === n.itemKey);
      const opt = item?.options.find(o => o.key === n.optionKey);
      if (item) lines.push(`  ・${item.name}（${opt?.label ?? ''}）${n.buyerName ? ` ${n.buyerName}` : ''}${n.label ? ` 記載名：${n.label}` : ''}`);
    }
  }
  lines.push('');
  lines.push(`お振込金額：${fees.total.toLocaleString()}円（登録料 ${fees.registrationFee.toLocaleString()}円 / 物販・協賛 ${fees.itemsFee.toLocaleString()}円）`);
  if (config.paymentDeadline) lines.push(`お振込期日：${config.paymentDeadline}`);
  if (config.bankInfo) {
    lines.push('');
    lines.push('【お振込先】');
    lines.push(config.bankInfo);
  }
  return lines.join('\n');
}

/** メール送信（RESEND_API_KEY が無い環境では何もしない） */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || 'noreply@raccloud.jp', to, subject, text }),
    });
    return res.ok;
  } catch (e) {
    console.error('sendMail failed:', e);
    return false;
  }
}

/** 申込者に見せてよいフォーム設定（通知先メールアドレスは隠す） */
export function publicConfig(config: RegistrationFormConfig) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { notifyEmail, ...rest } = config;
  return rest;
}

/** 公開中（下書き以外）のフォームを取得する */
export async function loadPublicForm(db: Db, slug: string) {
  const [form] = await db
    .select()
    .from(registrationForms)
    .where(and(eq(registrationForms.slug, slug.slice(0, 40)), isNull(registrationForms.deletedAt)))
    .limit(1);
  if (!form) return null;
  const config = sanitizeConfig(form.config);
  if (config.status === 'draft') return null;
  return { form, config };
}

/** 選べるクラブ（フォームの地区の有効なクラブ）と地区名 */
export async function loadDistrictClubs(db: Db, districtId: string) {
  const [d] = await db
    .select({ name: districts.name, number: districts.districtNumber })
    .from(districts)
    .where(eq(districts.id, districtId))
    .limit(1);
  const cols = { id: clubs.id, name: clubs.name, shortName: clubs.shortName, type: clubs.type };
  const active = and(isNull(clubs.deletedAt), eq(clubs.isActive, true), eq(clubs.isSystemClub, false));
  let list = await db
    .select(cols)
    .from(clubs)
    .where(and(eq(clubs.districtId, districtId), active))
    .orderBy(asc(clubs.name));
  if (list.length === 0 && (await db.select({ id: districts.id }).from(districts).where(isNull(districts.deletedAt)).limit(2)).length === 1) {
    // クラブに地区が未設定のデータ（単一地区運用）では、地区未設定のクラブを対象にする
    list = await db
      .select(cols)
      .from(clubs)
      .where(and(isNull(clubs.districtId), active))
      .orderBy(asc(clubs.name));
  }
  return {
    districtName: d?.number ? `第${d.number}地区` : d?.name ?? '',
    clubs: list as Array<{ id: string; name: string; shortName: string | null; type: string }>,
  };
}


/** 地区役員が扱ってよいフォームか確認して取得する */
export async function loadStaffForm(db: Db, formId: string, staff: { role: string; districtId: string | null }) {
  const [form] = await db
    .select()
    .from(registrationForms)
    .where(and(eq(registrationForms.id, formId.slice(0, 64)), isNull(registrationForms.deletedAt)))
    .limit(1);
  if (!form) return null;
  if (staff.role !== 'system_owner' && form.districtId !== staff.districtId) return null;
  return { form, config: sanitizeConfig(form.config) };
}

/** 同じクラブの申込が既にある（一意制約 uq_event_registrations_club 違反） */
export function isDuplicateClubError(e: unknown): boolean {
  const err = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } } | null;
  const code = err?.code ?? err?.cause?.code;
  const constraint = err?.constraint ?? err?.cause?.constraint ?? '';
  return code === '23505' && constraint.includes('club');
}

export const DUPLICATE_CLUB_MESSAGE =
  'このクラブはすでに申込済みです。参加者の追加・変更は、申込時に届いたメールの「修正用リンク」から行ってください。リンクが分からない場合は地区役員にお問い合わせください。';

/** 申込内容の修正で金額が変わったとき、入金状況を合わせる */
export function reconcilePaymentStatus(
  reg: { paymentStatus: string; paidAmount: number },
  newTotal: number,
): string {
  if (reg.paidAmount <= 0) return reg.paymentStatus === 'paid' && newTotal > 0 ? 'unpaid' : reg.paymentStatus;
  return reg.paidAmount >= newTotal ? 'paid' : 'partial';
}
