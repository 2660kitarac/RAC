/**
 * 権限判定（src/lib/auth/tenant.ts・password.ts）の実コードを使ったテスト
 *
 * TypeScript を esbuild でその場で変換して読み込むため、ロジックの写しではなく本体を検証できる。
 * 実行: node scripts/test-permissions.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'perm-test-'));
const out = join(dir, 'auth.mjs');
await build({
  stdin: {
    contents: "export * from './src/lib/auth/tenant'; export * from './src/lib/auth/password';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
const m = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const t = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : `  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
};

const owner = { id: 'o', role: 'system_owner', clubId: null };
const dAdmin = { id: 'da', role: 'district_admin', clubId: null };
const dSec = { id: 'ds', role: 'district_secretary', clubId: null };
const dTreasurer = { id: 'dt', role: 'district_treasurer', clubId: null };
const clubA = { id: 'ca', role: 'club_account', clubId: 'A' };
const memberA = { id: 'ma', role: 'member', clubId: 'A' };
const orphan = { id: 'x', role: 'member', clubId: null };

console.log('--- クラブ範囲（resolveClubScope） ---');
t('クラブ未所属の会員は拒否（全クラブ参照の防止）', m.resolveClubScope(orphan, null).forbidden, true);
t('地区ロール外の地区役員（会計）も拒否', m.resolveClubScope(dTreasurer, null).forbidden, true);
t('クラブアカウントは自クラブに固定', m.resolveClubScope(clubA, null), { clubId: 'A', crossClub: false, forbidden: false });
t('クラブアカウントが他クラブ要求 → 拒否', m.resolveClubScope(clubA, 'B').forbidden, true);
t('システムオーナー未指定 → 横断', m.resolveClubScope(owner, null).crossClub, true);

console.log('--- 運営・会計ロール ---');
t('一般会員はクラブ運営不可', m.canManageClub('member'), false);
t('一般会員は会計不可', m.canManageFinance('member'), false);
t('クラブアカウントは運営可', m.canManageClub('club_account'), true);

console.log('--- ロール付与（会員追加での権限昇格） ---');
t('クラブアカウントが system_owner を付与 → 不可', m.canAssignRole('club_account', 'system_owner', null), false);
t('クラブアカウントが district_admin を付与 → 不可', m.canAssignRole('club_account', 'district_admin', null), false);
t('クラブアカウントが member を付与 → 可', m.canAssignRole('club_account', 'member', null), true);

console.log('--- 上位アカウントの保護（canManageAccount） ---');
t('地区幹事 → system_owner 操作不可', m.canManageAccount('district_secretary', 'system_owner'), false);
t('地区幹事 → 地区管理者 操作不可', m.canManageAccount('district_secretary', 'district_admin'), false);
t('地区管理者 → 地区管理者 操作可', m.canManageAccount('district_admin', 'district_admin'), true);
t('クラブアカウント → 地区役員 操作不可', m.canManageAccount('club_account', 'district_treasurer'), false);
t('クラブアカウント → 一般会員 操作可', m.canManageAccount('club_account', 'member'), true);
t('system_owner → 誰でも可', m.canManageAccount('system_owner', 'system_owner'), true);

console.log('--- パスワードリセット ---');
t('地区幹事が system_owner をリセット → 不可', m.canResetPasswordFor(dSec, { role: 'system_owner', clubId: null }).allowed, false);
t('地区幹事が 地区管理者 をリセット → 不可', m.canResetPasswordFor(dSec, { role: 'district_admin', clubId: null }).allowed, false);
t('地区管理者が 地区管理者 をリセット → 可', m.canResetPasswordFor(dAdmin, { role: 'district_admin', clubId: null }).allowed, true);
t('地区幹事が 一般会員 をリセット → 可', m.canResetPasswordFor(dSec, { role: 'member', clubId: 'A' }).allowed, true);
t('クラブアカウントが自クラブ会員をリセット → 可', m.canResetPasswordFor(clubA, { role: 'member', clubId: 'A' }).allowed, true);
t('クラブアカウントが自クラブの地区役員をリセット → 不可', m.canResetPasswordFor(clubA, { role: 'district_pr_chair', clubId: 'A' }).allowed, false);
t('一般会員が他会員をリセット → 不可', m.canResetPasswordFor(memberA, { role: 'member', clubId: 'A' }).allowed, false);

console.log('--- 領収書の印刷（canPrintReceipt） ---');
const issuedA = { clubId: 'A', status: 'issued' };
const issuedB = { clubId: 'B', status: 'issued' };
const cancelledA = { clubId: 'A', status: 'cancelled' };
t('クラブアカウントが自クラブの発行済みを印刷 → 可', m.canPrintReceipt(clubA, issuedA), true);
t('自クラブの一般会員は管理画面から印刷不可（会員画面のマイ領収書を使う）', m.canPrintReceipt(memberA, issuedA), false);
t('自クラブの会計は発行済みを印刷 → 可', m.canPrintReceipt({ id: 'ta', role: 'treasurer', clubId: 'A' }, issuedA), true);
t('自クラブの会長は発行済みを印刷 → 可', m.canPrintReceipt({ id: 'pa', role: 'president', clubId: 'A' }, issuedA), true);
t('自クラブの幹事（会計権限なし）は印刷不可', m.canPrintReceipt({ id: 'sa', role: 'secretary', clubId: 'A' }, issuedA), false);
t('クラブアカウントが他クラブの領収書を印刷 → 不可', m.canPrintReceipt(clubA, issuedB), false);
t('クラブ未所属の会員 → 不可（全クラブ印刷の防止）', m.canPrintReceipt(orphan, issuedA), false);
t('地区ロール外の地区役員（会計）→ 不可', m.canPrintReceipt(dTreasurer, issuedA), false);
t('取消済みは自クラブでも印刷不可', m.canPrintReceipt(clubA, cancelledA), false);
t('地区管理者は他クラブの発行済みも印刷可', m.canPrintReceipt(dAdmin, issuedB), true);
t('システムオーナーでも取消済みは印刷不可', m.canPrintReceipt(owner, cancelledA), false);
t('クラブ未設定の領収書は地区スタッフ以外は不可', m.canPrintReceipt(clubA, { clubId: null, status: 'issued' }), false);
t('未ログイン相当 → 不可', m.canPrintReceipt(null, issuedA), false);

console.log('--- 仮パスワード ---');
const pw = m.generateTemporaryPassword(10);
t('仮パスワードは10文字・英字と数字を含む', pw.length === 10 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw), true);
t('仮パスワードは毎回異なる', m.generateTemporaryPassword(10) !== m.generateTemporaryPassword(10), true);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
