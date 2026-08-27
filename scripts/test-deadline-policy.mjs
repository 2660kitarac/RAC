/**
 * 締切ポリシー（遅延登録）ロジックのテスト
 *
 * src/lib/meetings/deadline.ts の evaluateDeadline を TypeScript の型を外した形で
 * 再実装せず、ロジックを同一の順序・条件で検証する。
 * （実装が変わったらこのテストも更新すること）
 *
 * 実行: node scripts/test-deadline-policy.mjs
 */

// ---- 実装のミラー（deadline.ts と同じロジック） ----
function normalizeDeadlinePolicy(value) {
  return value === 'strict' || value === 'meal_strict' || value === 'flexible' ? value : 'flexible';
}

function todayJst(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}

function diffDays(a, b) {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((ta - tb) / 86400000);
}

function evaluateDeadline(meeting, now = new Date()) {
  const policy = normalizeDeadlinePolicy(meeting.deadlinePolicy);
  const today = todayJst(now);
  const deadline = meeting.registrationDeadline || null;
  const deadlinePassed = !!deadline && today > deadline;
  const daysLate = deadlinePassed && deadline ? diffDays(today, deadline) : null;
  const base = { deadlinePassed, isLate: false, daysLate, policy };

  if (meeting.finishedAt) {
    return { ...base, allowed: false, reason: 'meeting_finished', mealAllowed: false };
  }
  if (meeting.status && meeting.status !== 'open') {
    return { ...base, allowed: false, reason: 'meeting_not_open', mealAllowed: false };
  }
  if (meeting.date && today > meeting.date) {
    return { ...base, allowed: false, reason: 'meeting_date_passed', mealAllowed: false };
  }
  if (!deadlinePassed) {
    return { ...base, allowed: true, mealAllowed: true };
  }
  if (policy === 'strict') {
    return { ...base, allowed: false, reason: 'deadline_passed', mealAllowed: false };
  }
  if (policy === 'meal_strict') {
    return { ...base, allowed: true, isLate: true, mealAllowed: false };
  }
  return { ...base, allowed: true, isLate: true, mealAllowed: true };
}

// ---- テストハーネス ----
let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const keys = Object.keys(expected);
  const mismatch = keys.filter(k => JSON.stringify(actual[k]) !== JSON.stringify(expected[k]));
  if (mismatch.length === 0) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
    for (const k of mismatch) {
      console.log(`      ${k}: expected ${JSON.stringify(expected[k])}, got ${JSON.stringify(actual[k])}`);
    }
  }
}

// 基準時刻: 2026-08-27 12:00 JST
const NOW = new Date('2026-08-27T03:00:00Z');

console.log('\n=== 1. 締切前 ===');
check('締切前は登録可・遅延なし',
  evaluateDeadline({ registrationDeadline: '2026-08-30', status: 'open', date: '2026-09-05' }, NOW),
  { allowed: true, isLate: false, deadlinePassed: false, mealAllowed: true, daysLate: null });

check('締切当日は登録可（today > deadline ではない）',
  evaluateDeadline({ registrationDeadline: '2026-08-27', status: 'open', date: '2026-09-05' }, NOW),
  { allowed: true, isLate: false, deadlinePassed: false, mealAllowed: true });

check('締切なしは常に登録可',
  evaluateDeadline({ registrationDeadline: null, status: 'open', date: '2026-09-05' }, NOW),
  { allowed: true, isLate: false, deadlinePassed: false, mealAllowed: true });

console.log('\n=== 2. 締切後 × flexible（既定）===');
check('flexible: 締切後も登録可・遅延フラグON・食事OK',
  evaluateDeadline({ registrationDeadline: '2026-08-20', deadlinePolicy: 'flexible', status: 'open', date: '2026-09-05' }, NOW),
  { allowed: true, isLate: true, deadlinePassed: true, mealAllowed: true, daysLate: 7 });

check('ポリシー未設定（null）は flexible 扱い',
  evaluateDeadline({ registrationDeadline: '2026-08-25', deadlinePolicy: null, status: 'open', date: '2026-09-05' }, NOW),
  { allowed: true, isLate: true, mealAllowed: true, policy: 'flexible', daysLate: 2 });

check('未知の値も flexible にフォールバック',
  evaluateDeadline({ registrationDeadline: '2026-08-25', deadlinePolicy: 'weird', status: 'open', date: '2026-09-05' }, NOW),
  { allowed: true, isLate: true, policy: 'flexible' });

check('締切1日超過の日数計算',
  evaluateDeadline({ registrationDeadline: '2026-08-26', status: 'open', date: '2026-09-05' }, NOW),
  { daysLate: 1, isLate: true });

check('締切30日超過の日数計算',
  evaluateDeadline({ registrationDeadline: '2026-07-28', status: 'open', date: '2026-09-05' }, NOW),
  { daysLate: 30, isLate: true });

console.log('\n=== 3. 締切後 × meal_strict ===');
check('meal_strict: 登録は可だが食事は不可',
  evaluateDeadline({ registrationDeadline: '2026-08-20', deadlinePolicy: 'meal_strict', status: 'open', date: '2026-09-05' }, NOW),
  { allowed: true, isLate: true, mealAllowed: false, policy: 'meal_strict' });

check('meal_strict: 締切前なら食事も可',
  evaluateDeadline({ registrationDeadline: '2026-08-30', deadlinePolicy: 'meal_strict', status: 'open', date: '2026-09-05' }, NOW),
  { allowed: true, isLate: false, mealAllowed: true });

console.log('\n=== 4. 締切後 × strict（従来の挙動）===');
check('strict: 締切後は登録不可',
  evaluateDeadline({ registrationDeadline: '2026-08-20', deadlinePolicy: 'strict', status: 'open', date: '2026-09-05' }, NOW),
  { allowed: false, reason: 'deadline_passed', deadlinePassed: true, mealAllowed: false });

check('strict: 締切前は登録可',
  evaluateDeadline({ registrationDeadline: '2026-08-30', deadlinePolicy: 'strict', status: 'open', date: '2026-09-05' }, NOW),
  { allowed: true, isLate: false, mealAllowed: true });

console.log('\n=== 5. ポリシーに関わらず拒否されるケース ===');
check('終了処理済み（finishedAt）は flexible でも拒否',
  evaluateDeadline({ registrationDeadline: '2026-08-30', deadlinePolicy: 'flexible', status: 'open', finishedAt: '2026-08-26 20:00:00', date: '2026-09-05' }, NOW),
  { allowed: false, reason: 'meeting_finished', mealAllowed: false });

check('終了処理済みは締切後でも拒否（帳簿保護）',
  evaluateDeadline({ registrationDeadline: '2026-08-20', deadlinePolicy: 'flexible', status: 'open', finishedAt: '2026-08-26 20:00:00' }, NOW),
  { allowed: false, reason: 'meeting_finished' });

check('status=draft は拒否',
  evaluateDeadline({ registrationDeadline: '2026-08-30', deadlinePolicy: 'flexible', status: 'draft', date: '2026-09-05' }, NOW),
  { allowed: false, reason: 'meeting_not_open' });

check('status=closed は拒否',
  evaluateDeadline({ registrationDeadline: '2026-08-30', deadlinePolicy: 'flexible', status: 'closed', date: '2026-09-05' }, NOW),
  { allowed: false, reason: 'meeting_not_open' });

check('status=cancelled は拒否',
  evaluateDeadline({ registrationDeadline: '2026-08-30', deadlinePolicy: 'flexible', status: 'cancelled', date: '2026-09-05' }, NOW),
  { allowed: false, reason: 'meeting_not_open' });

check('開催日を過ぎた例会は flexible でも拒否',
  evaluateDeadline({ registrationDeadline: '2026-08-20', deadlinePolicy: 'flexible', status: 'open', date: '2026-08-25' }, NOW),
  { allowed: false, reason: 'meeting_date_passed' });

check('開催日当日は登録可（today > date ではない）',
  evaluateDeadline({ registrationDeadline: '2026-08-20', deadlinePolicy: 'flexible', status: 'open', date: '2026-08-27' }, NOW),
  { allowed: true, isLate: true });

console.log('\n=== 6. 拒否の優先順位 ===');
check('終了処理済みが最優先（strict + 開催日前）',
  evaluateDeadline({ registrationDeadline: '2026-08-20', deadlinePolicy: 'strict', status: 'draft', finishedAt: '2026-08-26', date: '2026-08-01' }, NOW),
  { allowed: false, reason: 'meeting_finished' });

check('ステータスが開催日超過より優先',
  evaluateDeadline({ status: 'draft', date: '2026-08-01' }, NOW),
  { allowed: false, reason: 'meeting_not_open' });

console.log('\n=== 7. JST境界の確認 ===');
// UTC 2026-08-26 16:00 = JST 2026-08-27 01:00 → JSTの「今日」は 08-27
check('UTC前日夜でもJSTでは翌日として判定',
  evaluateDeadline({ registrationDeadline: '2026-08-26', status: 'open' }, new Date('2026-08-26T16:00:00Z')),
  { deadlinePassed: true, isLate: true, daysLate: 1 });

// UTC 2026-08-26 14:00 = JST 2026-08-26 23:00 → JSTの「今日」は 08-26
check('UTC同日夕方はJSTでも同日（締切当日＝まだ間に合う）',
  evaluateDeadline({ registrationDeadline: '2026-08-26', status: 'open' }, new Date('2026-08-26T14:00:00Z')),
  { deadlinePassed: false, isLate: false });

console.log('\n=== 8. 不正な締切値 ===');
check('不正な日付形式でも例外を投げない',
  evaluateDeadline({ registrationDeadline: 'not-a-date', status: 'open' }, NOW),
  { allowed: true });

console.log(`\n${'='.repeat(50)}`);
console.log(`結果: ${pass} passed / ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
