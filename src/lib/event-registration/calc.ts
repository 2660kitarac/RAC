/**
 * 申込の金額計算と入力チェック（サーバー・画面共通）
 * 画面での表示と、サーバーでの保存時の計算を必ず同じ関数で行う。
 */
import type {
  FeeBreakdown,
  RegistrationAttendee,
  RegistrationFormConfig,
  RegistrationInput,
} from './types';

/** 参加者が1つでも枠に参加しているか */
export function isAttending(a: RegistrationAttendee): boolean {
  return Object.values(a.sessions ?? {}).some(Boolean);
}

/** 参加者の表示名 */
export function attendeeName(a: Pick<RegistrationAttendee, 'lastName' | 'firstName'>): string {
  return [a.lastName, a.firstName].map(s => (s ?? '').trim()).filter(Boolean).join(' ');
}

/** 申込の金額を計算する */
export function calcFees(config: RegistrationFormConfig, input: Pick<RegistrationInput, 'attendees' | 'items'>): FeeBreakdown {
  const perAttendee: Record<string, number> = {};
  let registrationFee = 0;

  for (const a of input.attendees) {
    const cat = config.categories.find(c => c.key === a.category);
    let fee = 0;
    if (cat && config.feeMode === 'per_person') {
      const chargedAttending = config.sessions.some(s => s.charged && a.sessions?.[s.key]);
      fee = chargedAttending ? cat.fee : 0;
    } else if (cat && config.feeMode === 'per_session') {
      fee = config.sessions.reduce((sum, s) => sum + (a.sessions?.[s.key] ? cat.sessionFees?.[s.key] ?? 0 : 0), 0);
    }
    perAttendee[a.id] = fee;
    registrationFee += fee;
  }

  if (config.feeMode === 'per_club') {
    // 参加者が1人もいない申込（物販・協賛だけ）でも、クラブとしての登録料はかかる扱い
    registrationFee = config.clubFee;
  }

  const itemLines: FeeBreakdown['itemLines'] = [];
  for (const item of config.items) {
    if (item.kind === 'quantity') {
      const qty = Math.max(0, Math.floor(input.items?.quantities?.[item.key] ?? 0));
      if (qty > 0) itemLines.push({ name: item.name, detail: `${qty}点 × ${item.price.toLocaleString()}円`, amount: qty * item.price });
    } else {
      const rows = (input.items?.named ?? []).filter(n => n.itemKey === item.key);
      for (const opt of item.options) {
        const count = rows.filter(r => r.optionKey === opt.key).length;
        if (count > 0) {
          itemLines.push({ name: `${item.name}（${opt.label}）`, detail: `${count}件 × ${opt.price.toLocaleString()}円`, amount: count * opt.price });
        }
      }
    }
  }
  const itemsFee = itemLines.reduce((s, l) => s + l.amount, 0);

  return { registrationFee, itemsFee, total: registrationFee + itemsFee, perAttendee, itemLines };
}

/** 入力チェック。問題があればメッセージの配列を返す（空なら OK） */
export function validateInput(config: RegistrationFormConfig, input: RegistrationInput): string[] {
  const errors: string[] = [];
  if (!input.clubName.trim()) errors.push('クラブ名を入力してください');
  if (!input.registrantName.trim()) errors.push('登録責任者のお名前を入力してください');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.registrantEmail.trim())) errors.push('連絡先メールアドレスを正しく入力してください');

  const named = (input.items?.named ?? []).length;
  const qty = Object.values(input.items?.quantities ?? {}).some(v => v > 0);
  if (input.attendees.length === 0 && named === 0 && !qty) {
    errors.push('参加者を1人以上入力してください');
  }

  input.attendees.forEach((a, i) => {
    const label = `参加者${i + 1}`;
    if (!a.lastName.trim()) errors.push(`${label}：姓を入力してください`);
    if (!config.categories.some(c => c.key === a.category)) errors.push(`${label}：区分を選んでください`);
    if (config.sessions.length > 0 && !isAttending(a)) errors.push(`${label}：参加する枠を1つ以上選んでください`);
  });

  for (const n of input.items?.named ?? []) {
    const item = config.items.find(i => i.key === n.itemKey);
    if (!item) continue;
    if (!item.options.some(o => o.key === n.optionKey)) errors.push(`${item.name}：種類を選んでください`);
    if (item.requireLabel && !n.label.trim()) errors.push(`${item.name}：記載名を入力してください`);
  }
  return errors;
}

/** 締切を過ぎているか（締切日の 23:59 JST まで受付） */
export function isPastDeadline(deadline: string | null | undefined, now = new Date()): boolean {
  if (!deadline) return false;
  const end = new Date(`${deadline.slice(0, 10)}T23:59:59+09:00`);
  return now.getTime() > end.getTime();
}

/** 申込を受け付けているか */
export function isAccepting(config: Pick<RegistrationFormConfig, 'status' | 'deadline'>, now = new Date()): boolean {
  return config.status === 'open' && !isPastDeadline(config.deadline, now);
}
