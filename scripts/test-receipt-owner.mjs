/**
 * 領収書の持ち主の判定（src/lib/receipts/owner.ts）の実コードを使ったテスト
 *
 * TypeScript を esbuild でその場で変換して読み込むため、ロジックの写しではなく本体を検証できる。
 * 実行: node scripts/test-receipt-owner.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'owner-test-'));
const out = join(dir, 'owner.mjs');
await build({
  stdin: {
    contents: "export * from './src/lib/receipts/owner'; export { PgDialect } from 'drizzle-orm/pg-core';",
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

console.log('--- 本人の領収書の条件（ownReceiptsCondition） ---');
const q = new m.PgDialect().sqlToQuery(m.ownReceiptsCondition('user-1'));
t('会員IDで絞り込む', q.sql.includes('"receipts"."user_id" = $1'), true);
t('発行済みだけ', q.sql.includes('"receipts"."status" = $2'), true);
t('削除済みは除く', q.sql.includes('"receipts"."deleted_at" is null'), true);
t('パラメータは会員IDと issued', q.params, ['user-1', 'issued']);

console.log('--- 手入力発行の会員ID（receiptOwnerFromAttendance） ---');
t('自クラブの例会の会員の出欠 → その会員', m.receiptOwnerFromAttendance({ userId: 'u1', meetingClubId: 'A' }, 'A'), 'u1');
t('他クラブの例会の出欠 → 結び付けない', m.receiptOwnerFromAttendance({ userId: 'u1', meetingClubId: 'B' }, 'A'), null);
t('外部参加者の出欠（会員なし）→ 空', m.receiptOwnerFromAttendance({ userId: null, meetingClubId: 'A' }, 'A'), null);
t('例会のクラブが不明 → 結び付けない', m.receiptOwnerFromAttendance({ userId: 'u1', meetingClubId: null }, 'A'), null);
t('出欠記録が見つからない → 空', m.receiptOwnerFromAttendance(undefined, 'A'), null);
t('出欠記録の指定なし → 空', m.receiptOwnerFromAttendance(null, 'A'), null);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
