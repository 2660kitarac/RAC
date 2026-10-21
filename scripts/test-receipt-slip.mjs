/**
 * 領収書の表示の整形（src/lib/receipts/slip-format.ts）と電子印鑑の文字の折り返し（ReceiptStamp）の実コードを使ったテスト
 *
 * TypeScript を esbuild でその場で変換して読み込むため、ロジックの写しではなく本体を検証できる。
 * 実行: node scripts/test-receipt-slip.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'slip-test-'));
const out = join(dir, 'slip.mjs');
await build({
  stdin: {
    contents: "export * from './src/lib/receipts/slip-format'; export { normalizeStampText } from './src/components/receipts/ReceiptStamp';",
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true, jsx: 'automatic', format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
const m = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const t = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : `  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
};

console.log('--- 但し書き（receiptPurpose） ---');
t('「として」を付けて例会名を添える', m.receiptPurpose('例会参加費', '11月第2例会（第1397回）'), '例会参加費として　11月第2例会（第1397回）');
t('一括発行の但し書き（「として」で終わる）に「として」を重ねない', m.receiptPurpose('2026年度 年会費として', null), '2026年度 年会費として');
t('但し書きに例会名が入っていれば例会名を重ねない', m.receiptPurpose('11月例会 参加費として', '11月例会'), '11月例会 参加費として');
t('但し書きがなければ例会名だけ', m.receiptPurpose(null, '11月例会'), '11月例会');
t('どちらもなければ空', m.receiptPurpose('  ', null), '');

console.log('--- 金額（formatReceiptAmount） ---');
t('桁区切り', m.formatReceiptAmount(1234567), '¥1,234,567');
t('マイナスはそのまま表示（誤りに気付けるように）', m.formatReceiptAmount(-500), '-¥500');
t('数値でなければ0', m.formatReceiptAmount(NaN), '¥0');

console.log('--- 発行日（formatReceiptDate） ---');
t('年月日', m.formatReceiptDate('2026-09-05'), '2026年9月5日');
t('空なら空', m.formatReceiptDate(null), '');

console.log('--- 宛名の大きさ（receiptNameSize） ---');
t('通常の氏名は大', m.receiptNameSize('橋本　雄志'), 'l');
t('少し長い宛名は中', m.receiptNameSize('株式会社サンプルホールディングス総務部経理課'), 'm');
t('とても長い宛名は小', m.receiptNameSize('とても長い宛名の株式会社サンプルホールディングス代表取締役社長　山田太郎'), 's');
t('英数字は細いので長めでも大', m.receiptNameSize('Taro Yamada / ABC Company'), 'l');

console.log('--- 電子印鑑の文字の折り返し（normalizeStampText） ---');
t('大阪北RAC → 大阪北 / RAC', m.normalizeStampText('大阪北RAC'), ['大阪北', 'RAC']);
t('池田くれはRAC → 池田 / くれは / RAC', m.normalizeStampText('池田くれはRAC'), ['池田', 'くれは', 'RAC']);
t('2文字は1行', m.normalizeStampText('会計'), ['会計']);
t('英字だけ', m.normalizeStampText('ROTARACT').join(''), 'ROTARACT');
t('サロゲートペアの文字を途中で切らない', m.normalizeStampText('𠮷野家飯田橋RAC').every(l => !/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/.test(l)), true);
t('最大8文字', Array.from(m.normalizeStampText('一二三四五六七八九十').join('')).length, 8);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
