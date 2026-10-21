/**
 * 管理画面のページの制限（src/lib/auth/page-access.ts）の実コードを使ったテスト
 *
 * TypeScript を esbuild でその場で変換して読み込むため、ロジックの写しではなく本体を検証できる。
 * 実行: node scripts/test-page-access.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'page-access-test-'));
const out = join(dir, 'page-access.mjs');
await build({
  stdin: {
    contents: "export * from './src/lib/auth/page-access';",
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

const can = m.canAccessPage;
console.log('--- 一般会員 ---');
t('ダッシュボードは開ける（表にない）', can('member', '/dashboard'), true);
t('収支一覧は開けない', can('member', '/finance/transactions'), false);
t('会員管理は開けない', can('member', '/members'), false);
t('例会詳細は開けない', can('member', '/meetings/abc'), false);
t('メール作成は開けない', can('member', '/emails/compose'), false);
t('報告書は開けない', can('member', '/reports'), false);
t('ユーザー権限は開けない', can('member', '/users'), false);
t('設定（プロフィール・パスワード変更）は開ける', can('member', '/settings'), true);
t('CSVは開けない', can('member', '/csv'), false);
t('領収書一覧は開けない', can('member', '/receipts'), false);
console.log('--- 幹事（secretary） ---');
t('例会一覧は開ける', can('secretary', '/meetings'), true);
t('メール作成は開ける', can('secretary', '/emails/compose'), true);
t('収支一覧は開けない', can('secretary', '/finance/transactions'), false);
t('ユーザー権限は開けない', can('secretary', '/users'), false);
console.log('--- 会計（treasurer） ---');
t('収支一覧は開ける', can('treasurer', '/finance/annual-fees'), true);
t('報告書は開ける', can('treasurer', '/reports'), true);
t('メール作成は開けない', can('treasurer', '/emails/compose'), false);
console.log('--- 会長・クラブアカウント・地区管理者 ---');
t('会長はメール作成を開ける', can('president', '/emails/history'), true);
t('会長はユーザー権限を開けない', can('president', '/users'), false);
t('クラブアカウントはユーザー権限を開ける', can('club_account', '/users'), true);
t('地区管理者は収支一覧を開ける', can('district_admin', '/finance/transactions'), true);
console.log('--- パスの一致 ---');
t('/membersx は /members の規則に当たらない', can('member', '/membersx'), true);
t('ロールなしは制限ページを開けない', can(null, '/members'), false);
t('ロールなしでも表にないパスは開ける', can(undefined, '/dashboard'), true);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
