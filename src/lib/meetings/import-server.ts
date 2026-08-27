/**
 * スプレッドシート取り込み — サーバー側ヘルパー
 *
 * ファイル（.xlsx / .xls / .csv）の読み込みと、DB との照合
 * （クラブ・会員のマッチング、既存出席レコードの取得）を担う。
 *
 * 純粋な解析ロジックは `./import-parse` にある（クライアントからも import 可）。
 * このファイルは exceljs / DB に依存するのでサーバー限定。
 */

import { attendances, users, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import {
  normalizeName,
  normalizeClubName,
  type ExistingAttendance,
  type RowWithDuplicate,
} from './import-parse';

/** 受け付ける拡張子 */
export const ACCEPTED_EXTENSIONS = ['.xlsx', '.xlsm', '.csv', '.txt'];
/** 最大ファイルサイズ（5MB） */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** セル値を文字列/数値のプリミティブに落とす */
function cellToPrimitive(value: any): unknown {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString().split('T')[0];
  // exceljs のリッチテキスト
  if (typeof value === 'object') {
    if (Array.isArray((value as any).richText)) {
      return (value as any).richText.map((t: any) => t.text ?? '').join('');
    }
    // 数式セル
    if ('result' in value) return cellToPrimitive((value as any).result);
    if ('text' in value) return String((value as any).text);
    if ('hyperlink' in value && 'text' in value) return String((value as any).text);
  }
  return String(value);
}

/**
 * ファイルバッファを2次元配列に変換する。
 * .csv は UTF-8 / BOM 付き UTF-8 に対応（Shift_JIS は非対応 → 警告を返す）。
 */
export async function loadRowsFromFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<{ sheetName: string | null; rows: unknown[][]; warnings: string[] }> {
  const lower = (filename || '').toLowerCase();
  const warnings: string[] = [];

  // ---- CSV ----
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const { parseCsv } = await import('./import-parse');
    const text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('\uFFFD')) {
      warnings.push(
        'CSVの文字コードを判別できませんでした。UTF-8 で保存し直すか、.xlsx 形式でアップロードしてください。',
      );
    }
    return { sheetName: null, rows: parseCsv(text), warnings };
  }

  // ---- Excel ----
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);

  // 「記入方法」等の説明シートは避け、氏名列を持ちそうなシートを優先
  const sheets = wb.worksheets.filter(ws => ws.rowCount > 0);
  if (sheets.length === 0) {
    return { sheetName: null, rows: [], warnings: ['シートが空です'] };
  }

  const { findHeaderRow } = await import('./import-parse');

  let picked: any = null;
  let pickedRows: unknown[][] = [];

  for (const ws of sheets) {
    if (ws.name === '記入方法') continue;
    const rows = worksheetToRows(ws);
    if (findHeaderRow(rows)) {
      picked = ws;
      pickedRows = rows;
      break;
    }
  }

  if (!picked) {
    const ws = sheets.find(s => s.name !== '記入方法') || sheets[0];
    picked = ws;
    pickedRows = worksheetToRows(ws);
  }

  if (sheets.filter(s => s.name !== '記入方法').length > 1) {
    warnings.push(`複数のシートがあるため「${picked.name}」を読み込みました。`);
  }

  return { sheetName: picked.name, rows: pickedRows, warnings };
}

/** exceljs のワークシートを2次元配列にする（結合セルの値も展開） */
function worksheetToRows(ws: any): unknown[][] {
  const rows: unknown[][] = [];
  const maxCol = Math.max(1, ws.actualColumnCount || ws.columnCount || 1);

  ws.eachRow({ includeEmpty: true }, (row: any, rowNumber: number) => {
    const arr: unknown[] = [];
    for (let c = 1; c <= maxCol; c++) {
      arr.push(cellToPrimitive(row.getCell(c).value));
    }
    rows[rowNumber - 1] = arr;
  });

  // 抜けている行を空配列で埋める
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]) rows[i] = [];
  }
  return rows;
}

/** 既存の出席レコード（重複判定用）を取得 */
export async function loadExistingAttendances(
  db: any,
  meetingId: string,
): Promise<ExistingAttendance[]> {
  const rows = await db
    .select({
      id: attendances.id,
      userId: attendances.userId,
      externalName: attendances.externalName,
      clubName: attendances.clubName,
      participationType: attendances.participationType,
      userName: users.name,
    })
    .from(attendances)
    .leftJoin(users, eq(attendances.userId, users.id))
    .where(and(eq(attendances.meetingId, meetingId), isNull(attendances.deletedAt)));

  return rows.map((r: any) => ({
    id: r.id,
    displayName: r.userName || r.externalName || '',
    clubName: r.clubName || null,
    userId: r.userId || null,
    participationType: r.participationType || null,
  }));
}

export interface ClubIndexEntry {
  id: string;
  name: string;
  shortName: string | null;
}

/**
 * 行のクラブ名 / 氏名を DB のクラブ・会員に照合し、
 * matchedClubId / matchedUserId を埋める。
 *
 * - クラブは全クラブ（district横断）から正規化名で照合
 * - 会員は「照合できたクラブ」に所属する会員の中から氏名で照合
 *   （クラブ不明の行は氏名がユニークな場合のみ紐付ける）
 */
export async function matchClubsAndUsers(
  db: any,
  rows: RowWithDuplicate[],
): Promise<RowWithDuplicate[]> {
  if (rows.length === 0) return rows;

  // ---- クラブの索引 ----
  const clubRows: ClubIndexEntry[] = await db
    .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName })
    .from(clubs)
    .where(isNull(clubs.deletedAt));

  const clubByKey = new Map<string, string>();
  for (const c of clubRows) {
    const k = normalizeClubName(c.name);
    if (k && !clubByKey.has(k)) clubByKey.set(k, c.id);
    const sk = normalizeClubName(c.shortName);
    if (sk && !clubByKey.has(sk)) clubByKey.set(sk, c.id);
  }

  for (const row of rows) {
    const key = normalizeClubName(row.clubName);
    if (key) {
      row.matchedClubId = clubByKey.get(key) ?? null;
      if (!row.matchedClubId) {
        // 部分一致（「大阪北」→「大阪北ローターアクトクラブ」など）
        for (const [k, id] of clubByKey) {
          if (k.length >= 2 && (k.includes(key) || key.includes(k))) {
            row.matchedClubId = id;
            break;
          }
        }
      }
    } else {
      row.matchedClubId = null;
    }
  }

  // ---- 会員の索引（有効会員のみ） ----
  const userRows = await db
    .select({
      id: users.id,
      name: users.name,
      clubId: users.clubId,
    })
    .from(users)
    .where(isNull(users.deletedAt));

  const userByNameClub = new Map<string, string>();
  const userByName = new Map<string, string[]>();
  for (const u of userRows) {
    const nk = normalizeName(u.name);
    if (!nk) continue;
    const ck = u.clubId || '';
    const combo = `${nk}|${ck}`;
    if (!userByNameClub.has(combo)) userByNameClub.set(combo, u.id);
    const list = userByName.get(nk) || [];
    list.push(u.id);
    userByName.set(nk, list);
  }

  for (const row of rows) {
    // 既存出席レコードとの重複で userId が判明している場合はそれを尊重
    if (row.matchedUserId) continue;

    const nk = row.nameKey;
    if (!nk) continue;

    if (row.matchedClubId) {
      const hit = userByNameClub.get(`${nk}|${row.matchedClubId}`);
      if (hit) {
        row.matchedUserId = hit;
        continue;
      }
    }
    const candidates = userByName.get(nk) || [];
    if (candidates.length === 1) row.matchedUserId = candidates[0];
  }

  return rows;
}
