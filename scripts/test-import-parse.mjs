/**
 * スプレッドシート取り込みロジックのテスト
 *   node scripts/test-import-parse.mjs
 *
 * import-parse.ts は TS なので、tsx 相当のトランスパイルなしで動かすために
 * esbuild-register の代わりに一旦 tsc で JS に落として読み込む。
 */
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();
const outDir = mkdtempSync(path.join(tmpdir(), 'import-parse-'));

console.log('▶ import-parse.ts をトランスパイル...');
execSync(
  `npx tsc src/lib/meetings/import-parse.ts --outDir ${outDir} --module esnext --target es2022 --moduleResolution bundler --skipLibCheck`,
  { cwd: ROOT, stdio: 'inherit' },
);

const modPath = path.join(outDir, 'import-parse.js');
if (!existsSync(modPath)) {
  console.error('✖ トランスパイル結果が見つかりません');
  process.exit(1);
}
const M = await import(pathToFileURL(modPath).href);

let pass = 0;
let fail = 0;
function t(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}\n     期待: ${e}\n     実際: ${a}`);
  }
}
function section(name) {
  console.log(`\n── ${name} ──`);
}

// ============================================================
section('normalizeName');
t('全角スペース除去', M.normalizeName('山田　太郎'), '山田太郎');
t('半角スペース除去', M.normalizeName(' 山田 太郎 '), '山田太郎');
t('改行除去', M.normalizeName('田中一義\n'), '田中一義');
t('英字は小文字化', M.normalizeName('Taro YAMADA'), 'taroyamada');
t('全角英数はNFKC正規化', M.normalizeName('ＡＢＣ'), 'abc');
t('null', M.normalizeName(null), '');

section('normalizeClubName');
t('ローターアクトクラブ→rac', M.normalizeClubName('大阪北ローターアクトクラブ'), '大阪北rac');
t('RAC表記も同一キー', M.normalizeClubName('大阪北RAC'), '大阪北rac');
t('ロータリークラブ→rc', M.normalizeClubName('大阪東ロータリークラブ'), '大阪東rc');
t('全角カッコ除去', M.normalizeClubName('ゲスト（東RAC）'), 'ゲスト');
t('半角カッコ除去', M.normalizeClubName('ゲスト(南RAC)'), 'ゲスト');
t('空', M.normalizeClubName(''), '');

section('isMarked');
t('○', M.isMarked('○'), true);
t('◯', M.isMarked('◯'), true);
t('〇', M.isMarked('〇'), true);
t('●', M.isMarked('●'), true);
t('✓', M.isMarked('✓'), true);
t('1', M.isMarked(1), true);
t('true', M.isMarked(true), true);
t('有', M.isMarked('有'), true);
t('空文字', M.isMarked(''), false);
t('null', M.isMarked(null), false);
t('無関係な文字', M.isMarked('あああ'), false);

section('parseParticipationText');
t('例会のみ', M.parseParticipationText('例会のみ'), 'meeting_only');
t('例会+懇親会', M.parseParticipationText('例会+懇親会'), 'meeting_and_party');
t('例会＋懇親会(全角)', M.parseParticipationText('例会＋懇親会'), 'meeting_and_party');
t('懇親会のみ', M.parseParticipationText('懇親会のみ'), 'party_only');
t('欠席', M.parseParticipationText('欠席'), 'absent');
t('出席', M.parseParticipationText('出席'), 'meeting_only');
t('不明', M.parseParticipationText('？？？'), null);

section('inferMemberType');
t('ゲスト', M.inferMemberType(null, 'ゲスト（東RAC）'), 'GUEST');
t('ロータリークラブ→RC', M.inferMemberType(null, '大阪東ロータリークラブ'), 'RC');
t('ローターアクト→RAC', M.inferMemberType(null, '大阪北ローターアクトクラブ'), 'RAC');
t('OB', M.inferMemberType('OB', '大阪北RAC'), 'OB_OG');
t('クラブ空→GUEST', M.inferMemberType(null, ''), 'GUEST');
t('明示RC優先', M.inferMemberType('RC', '大阪北ローターアクトクラブ'), 'RC');

section('normalizeGender');
t('男', M.normalizeGender('男'), '男');
t('男性→男', M.normalizeGender('男性'), '男');
t('女', M.normalizeGender('女'), '女');
t('空', M.normalizeGender(''), null);

// ============================================================
section('detectColumns / findHeaderRow（実ファイル形式）');
const realHeader = [null, 'クラブ名', '氏名', '性別', '例会のみ', '例会+懇親会', '役職', null, null];
const det = M.detectColumns(realHeader);
t('氏名列', det.map.name, 2);
t('クラブ名列', det.map.clubName, 1);
t('性別列', det.map.gender, 3);
t('例会のみ列', det.map.meetingOnly, 4);
t('例会+懇親会列', det.map.meetingAndParty, 5);
t('役職列', det.map.position, 6);

const realRows = [
  ['5クラブ合同スポーツ例会', null, null, null, null, null, null, null, null],
  realHeader,
  ['例', '大阪北ローターアクトクラブ', '中辻昴', '男', '○', null, '会長', null, null],
  [1, '大阪北ローターアクトクラブ', '山田太郎', '男', '○', null, null, null, null],
  [2, '大阪東ロータリークラブ', '佐藤花子', '女', null, '○', '幹事', null, null],
  [11.0, 'ゲスト（東RAC）', '田中一義\n', '男', null, '○', null, null, null],
  [4, 'ゲスト(南RAC)', '鈴木次郎', '男', '懇親会のみ', null, null, null, null],
  [null, null, null, null, null, null, null, null, null],
];
const hf = M.findHeaderRow(realRows);
t('ヘッダ行index=1', hf?.index, 1);

section('parseSheet（実ファイル形式）');
const ps = M.parseSheet(realRows);
t('データ行数（例行スキップ）', ps.rows.length, 4);
t('1件目氏名', ps.rows[0].name, '山田太郎');
t('1件目参加形式', ps.rows[0].participationType, 'meeting_only');
t('1件目会員区分', ps.rows[0].memberType, 'RAC');
t('2件目参加形式', ps.rows[1].participationType, 'meeting_and_party');
t('2件目会員区分RC', ps.rows[1].memberType, 'RC');
t('2件目役職', ps.rows[1].position, '幹事');
t('3件目 改行入り氏名', ps.rows[2].name, '田中一義');
t('3件目 ゲスト判定', ps.rows[2].memberType, 'GUEST');
t('4件目 マーク列内の懇親会のみテキスト', ps.rows[3].participationType, 'party_only');
t('エラー行なし', ps.rows.filter(r => r.errors.length).length, 0);

section('parseSheet（参加形式テキスト列形式=ひな型）');
const tplRows = [
  ['例会 出席者取り込み用シート'],
  ['No', 'クラブ名', '氏名', '性別', '参加形式', '役職', '食事', '備考'],
  ['例', '大阪北ローターアクトクラブ', '山田太郎', '男', '例会+懇親会', '会長', '要', 'アレルギー：えび'],
  [1, '大阪北RAC', '青木一郎', '男', '例会のみ', null, '要', null],
  [2, '大阪南RAC', '井上二郎', '男', '欠席', null, null, null],
  [3, null, '上田三郎', null, '懇親会のみ', null, '不要', 'メモ'],
];
const ps2 = M.parseSheet(tplRows);
t('ひな型 データ行数', ps2.rows.length, 3);
t('例行がスキップされる', ps2.rows[0].name, '青木一郎');
t('食事 要→true', ps2.rows[0].mealRequired, true);
t('欠席', ps2.rows[1].participationType, 'absent');
t('食事 不要→false', ps2.rows[2].mealRequired, false);
t('備考', ps2.rows[2].note, 'メモ');
t('クラブ空→警告あり', ps2.rows[2].warnings.length > 0, true);

section('氏名なし行はエラー行として残す / 完全な空行は除外');
const badRows = [
  ['No', 'クラブ名', '氏名', '参加形式'],
  [1, '大阪北RAC', '', '例会のみ'],   // 氏名空・他に値あり → エラー行
  [2, '佐々木四郎', undefined, undefined], // ← ダミー（後で上書き）
  [3, null, null, null],              // 完全な空行 → 除外
  [4, null, null, null],              // No だけ（ひな型の連番） → 除外
];
badRows[2] = [2, '大阪北RAC', '佐々木四郎', '例会のみ'];
const ps3 = M.parseSheet(badRows);
t('エラー行＋正常行の2件', ps3.rows.length, 2);
t('氏名空はエラー付きで残る', ps3.rows[0].errors, ['氏名が空です']);
t('正常行', ps3.rows[1].name, '佐々木四郎');
t('No のみの行はスキップされる', ps3.skippedEmpty, 2);

// ============================================================
section('detectDuplicates');
const parsedForDup = M.parseSheet([
  ['No', 'クラブ名', '氏名', '参加形式'],
  [1, '大阪北ローターアクトクラブ', '山田太郎', '例会のみ'],
  [2, '大阪東ロータリークラブ', '佐藤花子', '例会+懇親会'],
  [3, '大阪北RAC', '山田太郎', '例会+懇親会'],
  [4, '大阪南RAC', '新規太郎', '例会のみ'],
]).rows;

const existingDb = [
  { id: 'att-1', displayName: '山田　太郎', clubName: '大阪北RAC', userId: 'u1', participationType: 'meeting_only' },
  { id: 'att-2', displayName: '佐藤花子', clubName: null, userId: null, participationType: 'absent' },
];
const dup = M.detectDuplicates(parsedForDup, existingDb);
t('行1 既存重複（クラブ表記ゆれ吸収）', dup[0].duplicate, 'existing_attendance');
t('行1 重複相手ID', dup[0].duplicateOf?.attendanceId, 'att-1');
t('行1 userId引き継ぎ', dup[0].matchedUserId, 'u1');
t('行1 参加形式一致→conflicting false', dup[0].duplicateOf?.conflicting, false);
t('行2 クラブ名なし既存とも氏名照合', dup[1].duplicate, 'existing_attendance');
t('行2 参加形式相違→conflicting true', dup[1].duplicateOf?.conflicting, true);
t('行3 ファイル内重複', dup[2].duplicate, 'duplicate_in_file');
t('行3 重複元行番号', dup[2].duplicateOf?.rowNumber, dup[0].rowNumber);
t('行4 重複なし', dup[3].duplicate, 'none');

section('summarize');
const sum = M.summarize(dup);
t('total', sum.total, 4);
t('importable', sum.importable, 1);
t('duplicateExisting', sum.duplicateExisting, 2);
t('duplicateInFile', sum.duplicateInFile, 1);

// ============================================================
section('calcFees');
const fees = {
  feeRac: 3000, feeRc: 4000, feeObog: 3500, feeGuest: 5000,
  afterPartyFeeRac: 2000, afterPartyFeeRc: 2500, afterPartyFeeObog: 2200, afterPartyFeeGuest: 3000,
  ownClubFee: null,
};
t('RAC 例会のみ', M.calcFees('RAC', 'meeting_only', fees), { feeAmount: 3000, afterPartyFeeAmount: 0 });
t('RAC 例会+懇親会', M.calcFees('RAC', 'meeting_and_party', fees), { feeAmount: 3000, afterPartyFeeAmount: 2000 });
t('GUEST 懇親会のみ', M.calcFees('GUEST', 'party_only', fees), { feeAmount: 0, afterPartyFeeAmount: 3000 });
t('欠席は0円', M.calcFees('RC', 'absent', fees), { feeAmount: 0, afterPartyFeeAmount: 0 });
t('自クラブ(ownClubFee null)は0円', M.calcFees('RAC', 'meeting_only', fees, true), { feeAmount: 0, afterPartyFeeAmount: 0 });
t('自クラブ(ownClubFee 1000)', M.calcFees('RAC', 'meeting_and_party', { ...fees, ownClubFee: 1000 }, true), { feeAmount: 1000, afterPartyFeeAmount: 2000 });

section('parseCsv');
t('基本', M.parseCsv('a,b,c\n1,2,3'), [['a','b','c'],['1','2','3']]);
t('CRLF', M.parseCsv('a,b\r\n1,2'), [['a','b'],['1','2']]);
t('クォート内カンマ', M.parseCsv('a,"b,c"\n1,2'), [['a','b,c'],['1','2']]);
t('クォート内改行', M.parseCsv('a,"b\nc"'), [['a','b\nc']]);
t('エスケープされたクォート', M.parseCsv('a,"b""c"'), [['a','b"c']]);
t('BOM除去', M.parseCsv('\uFEFFa,b'), [['a','b']]);

// ============================================================
// 実ファイルでの検証
section('実ファイル（5クラブ合同スポーツ例会 登録用紙.xlsx）');
const realFile = '/home/user/uploaded_files/5クラブ合同スポーツ例会　登録用紙.xlsx';
if (existsSync(realFile)) {
  const require = (await import('module')).createRequire(import.meta.url);
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(realFile));
  const ws = wb.worksheets[0];
  const maxCol = Math.max(1, ws.actualColumnCount || ws.columnCount || 1);
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const arr = [];
    for (let c = 1; c <= maxCol; c++) {
      const v = row.getCell(c).value;
      if (v == null) arr.push(null);
      else if (typeof v === 'object' && Array.isArray(v.richText)) arr.push(v.richText.map(x => x.text).join(''));
      else if (typeof v === 'object' && 'result' in v) arr.push(v.result);
      else if (typeof v === 'object' && 'text' in v) arr.push(String(v.text));
      else arr.push(v);
    }
    rows[n - 1] = arr;
  });
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];

  const real = M.parseSheet(rows);
  console.log(`  ℹ ヘッダ行: ${real.header ? real.header.index + 1 : '検出できず'}`);
  console.log(`  ℹ 取り込み行数: ${real.rows.length} / 空行スキップ: ${real.skippedEmpty}`);
  t('ヘッダを検出できる', !!real.header, true);
  t('40行以上取り込める', real.rows.length >= 40, true);
  t('氏名エラーが無い', real.rows.filter(r => r.errors.length > 0).length, 0);
  t('例（記入例）行が含まれない', real.rows.some(r => r.name === '例'), false);
  t('全行に参加形式がある', real.rows.every(r => !!r.participationType), true);

  const partyOnly = real.rows.filter(r => r.participationType === 'party_only');
  const both = real.rows.filter(r => r.participationType === 'meeting_and_party');
  const only = real.rows.filter(r => r.participationType === 'meeting_only');
  console.log(`  ℹ 例会のみ:${only.length} / 例会+懇親会:${both.length} / 懇親会のみ:${partyOnly.length}`);
  console.log(`  ℹ 会員区分: RAC:${real.rows.filter(r=>r.memberType==='RAC').length} RC:${real.rows.filter(r=>r.memberType==='RC').length} GUEST:${real.rows.filter(r=>r.memberType==='GUEST').length}`);

  // ファイル内重複の確認
  const realDup = M.detectDuplicates(real.rows, []);
  const inFile = realDup.filter(r => r.duplicate === 'duplicate_in_file');
  console.log(`  ℹ ファイル内重複: ${inFile.length}件${inFile.length ? ' → ' + inFile.map(r=>r.name).join(', ') : ''}`);
  t('氏名が空の行がない', real.rows.every(r => r.name.length > 0), true);
} else {
  console.log('  ⚠ 実ファイルが見つからないためスキップ');
}

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${'='.repeat(50)}`);
console.log(`結果: ${pass} passed / ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
