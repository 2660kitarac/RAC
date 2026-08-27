/**
 * 登録締切の判定ロジック（サーバー/クライアント共用）
 *
 * 「締切を過ぎたら登録できない」から
 * 「締切を過ぎても登録できるが、遅延登録として記録する」への変更に伴い、
 * 締切判定を1箇所に集約したモジュール。
 *
 * ポリシー:
 *   'flexible'    締切後も登録可（食事も含めて受付）※既定
 *   'meal_strict' 締切後も登録可だが食事は不可
 *   'strict'      締切後は登録不可（従来の挙動）
 *
 * 共通ルール（ポリシーに関わらず適用）:
 *   - 例会が終了処理済み（finishedAt が設定済み）→ 登録不可
 *   - 例会ステータスが open 以外 → 登録不可
 *   - 例会開催日を過ぎている → 登録不可
 */

export type DeadlinePolicy = 'flexible' | 'meal_strict' | 'strict';

export const DEFAULT_DEADLINE_POLICY: DeadlinePolicy = 'flexible';

export function normalizeDeadlinePolicy(value: unknown): DeadlinePolicy {
  return value === 'strict' || value === 'meal_strict' || value === 'flexible'
    ? value
    : DEFAULT_DEADLINE_POLICY;
}

/** JST（Asia/Tokyo）の「今日」を YYYY-MM-DD で返す */
export function todayJst(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}

/** YYYY-MM-DD 同士の日数差（a - b）。不正な入力は null */
export function diffDays(a: string, b: string): number | null {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((ta - tb) / 86400000);
}

export interface MeetingDeadlineInput {
  /** YYYY-MM-DD or null */
  registrationDeadline?: string | null;
  /** 'flexible' | 'meal_strict' | 'strict'（未設定なら flexible 扱い） */
  deadlinePolicy?: string | null;
  /** 例会ステータス */
  status?: string | null;
  /** 例会終了処理日時（設定済みなら登録不可） */
  finishedAt?: string | null;
  /** 例会開催日 YYYY-MM-DD */
  date?: string | null;
}

export type DeadlineDenyReason =
  | 'meeting_finished'
  | 'meeting_not_open'
  | 'meeting_date_passed'
  | 'deadline_passed';

export interface DeadlineEvaluation {
  /** 登録操作を受け付けてよいか */
  allowed: boolean;
  /** 拒否理由（allowed=false のときのみ） */
  reason?: DeadlineDenyReason;
  /** ユーザー向けメッセージ（拒否理由 or 遅延登録の注意） */
  message?: string;
  /** 締切を過ぎているか（allowed の可否とは独立） */
  deadlinePassed: boolean;
  /** 遅延登録として記録すべきか */
  isLate: boolean;
  /** 締切から何日超過しているか（超過していなければ null） */
  daysLate: number | null;
  /** 食事（懇親会含む配膳手配）を受け付けられるか */
  mealAllowed: boolean;
  /** 適用されたポリシー */
  policy: DeadlinePolicy;
}

/**
 * 例会の登録可否を判定する。
 * @param meeting 例会情報（camelCase / snake_case どちらでも渡せるよう呼び出し側で整形）
 * @param now 判定基準時刻（テスト用）
 */
export function evaluateDeadline(
  meeting: MeetingDeadlineInput,
  now: Date = new Date()
): DeadlineEvaluation {
  const policy = normalizeDeadlinePolicy(meeting.deadlinePolicy);
  const today = todayJst(now);
  const deadline = meeting.registrationDeadline || null;
  const deadlinePassed = !!deadline && today > deadline;
  const daysLate = deadlinePassed && deadline ? diffDays(today, deadline) : null;

  const base = {
    deadlinePassed,
    isLate: false,
    daysLate,
    policy,
  };

  // --- ポリシーに関わらず登録を止めるケース ---
  if (meeting.finishedAt) {
    return {
      ...base,
      allowed: false,
      reason: 'meeting_finished',
      message: 'この例会は終了処理が完了しているため登録できません。運営にご連絡ください。',
      mealAllowed: false,
    };
  }

  if (meeting.status && meeting.status !== 'open') {
    return {
      ...base,
      allowed: false,
      reason: 'meeting_not_open',
      message: 'この例会は現在登録を受け付けていません。',
      mealAllowed: false,
    };
  }

  if (meeting.date && today > meeting.date) {
    return {
      ...base,
      allowed: false,
      reason: 'meeting_date_passed',
      message: 'この例会は既に開催日を過ぎているため登録できません。運営にご連絡ください。',
      mealAllowed: false,
    };
  }

  // --- 締切前 ---
  if (!deadlinePassed) {
    return { ...base, allowed: true, mealAllowed: true };
  }

  // --- 締切後 ---
  if (policy === 'strict') {
    return {
      ...base,
      allowed: false,
      reason: 'deadline_passed',
      message: `登録締切（${deadline}）を過ぎています。`,
      mealAllowed: false,
    };
  }

  if (policy === 'meal_strict') {
    return {
      ...base,
      allowed: true,
      isLate: true,
      message: `登録締切（${deadline}）を過ぎています。遅延登録として受け付けますが、食事の手配はできません。`,
      mealAllowed: false,
    };
  }

  // flexible
  return {
    ...base,
    allowed: true,
    isLate: true,
    message: `登録締切（${deadline}）を過ぎています。遅延登録として受け付けます（運営が個別に対応します）。`,
    mealAllowed: true,
  };
}

/**
 * snake_case の例会オブジェクト（クライアント側で扱う形）から判定する簡易版。
 */
export function evaluateDeadlineSnake(
  meeting: {
    registration_deadline?: string | null;
    deadline_policy?: string | null;
    status?: string | null;
    finished_at?: string | null;
    date?: string | null;
  },
  now: Date = new Date()
): DeadlineEvaluation {
  return evaluateDeadline(
    {
      registrationDeadline: meeting.registration_deadline ?? null,
      deadlinePolicy: meeting.deadline_policy ?? null,
      status: meeting.status ?? null,
      finishedAt: meeting.finished_at ?? null,
      date: meeting.date ?? null,
    },
    now
  );
}
