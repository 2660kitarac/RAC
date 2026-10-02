/**
 * スプレッドシート（Excel / CSV）で管理した例会出席者を取り込むための
 * 行の解析・正規化・重複判定ロジック。
 *
 * サーバー / クライアント共用（DB や fs には依存しない純粋関数のみ）。
 *
 * 実運用のシートは書式がまちまちなので、以下の両方に対応する:
 *   A) 標準ひな型     : 参加形式 列に「例会のみ / 例会+懇親会 / 懇親会のみ / 欠席」を記入
 *   B) ○マーク形式    : 「例会のみ」「例会+懇親会」の2列にそれぞれ ○ を立てる
 *                       （実際に配布されている「5クラブ合同スポーツ例会 登録用紙」の形式）
 */

// ============================================================
// 型
// ============================================================

export type ParticipationType =
  | 'meeting_only'
  | 'meeting_and_party'
  | 'party_only'
  | 'absent';

export type ImportMemberType = 'RAC' | 'RC' | 'OB_OG' | 'GUEST';

/** 取り込み1行の解析結果 */
export interface ParsedRow {
  /** 元ファイルの行番号（1始まり・ヘッダー含む） */
  rowNumber: number;
  name: string;
  /** 正規化済みの氏名（重複判定に使う） */
  nameKey: string;
  clubName: string | null;
  gender: string | null;
  position: string | null;
  participationType: ParticipationType;
  memberType: ImportMemberType;
  mealRequired: boolean;
  note: string | null;
  /** 解析できなかった / 要注意な内容 */
  errors: string[];
  warnings: string[];
}

/** 重複判定の結果 */
export type DuplicateKind =
  | 'none'
  /** 既に同じ例会に登録済み（アプリ側の登録と重複） */
  | 'existing_attendance'
  /** 同じファイル内に同じ人が複数行ある */
  | 'duplicate_in_file';

export interface RowWithDuplicate extends ParsedRow {
  duplicate: DuplicateKind;
  /** 重複相手の情報（表示用） */
  duplicateOf?: {
    attendanceId?: string;
    displayName: string;
    clubName: string | null;
    participationType: string | null;
    /** 参加形式が食い違っているか */
    conflicting?: boolean;
    rowNumber?: number;
  };
  /** 既存会員（users）と一致した場合の userId */
  matchedUserId?: string | null;
  /** 一致したクラブID */
  matchedClubId?: string | null;
}

// ============================================================
// 正規化
// ============================================================

/**
 * 氏名の正規化（重複判定用）。
 * - 前後の空白除去
 * - 全角/半角スペース・改行・タブをすべて削除（「山本 博之」と「山本博之」を同一視）
 * - 全角英数字を半角へ
 * - カタカナの大小・記号ゆれの吸収は行わない（過剰な同一視を避ける）
 */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .normalize('NFKC')
    .replace(/[\s\u3000\r\n\t]+/g, '')
    .trim()
    .toLowerCase();
}

/**
 * クラブ名の正規化（照合用）。
 * 「大阪北ローターアクトクラブ」「大阪北RAC」「大阪北ロータアクト」等を吸収する。
 */
export function normalizeClubName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).normalize('NFKC').replace(/[\s\u3000\r\n\t]+/g, '');
  // 括弧書きの補足を除去: ゲスト(南RAC) → ゲスト
  s = s.replace(/[（(].*?[）)]/g, '');
  // 表記ゆれの統一
  s = s
    .replace(/ローターアクトクラブ/g, 'RAC')
    .replace(/ロータアクトクラブ/g, 'RAC')
    .replace(/ローターアクト/g, 'RAC')
    .replace(/ロータリークラブ/g, 'RC')
    .replace(/ロータリｰクラブ/g, 'RC')
    .replace(/クラブ$/g, '');
  return s.toLowerCase();
}

// ============================================================
// 列の対応づけ
// ============================================================

/** ヘッダー名 → 論理カラム のマッピング候補 */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['氏名', '名前', 'お名前', '参加者名', 'name', '氏名（フルネーム）'],
  clubName: ['クラブ名', 'クラブ', '所属', '所属クラブ', 'club', 'クラブ名（正式名称）'],
  gender: ['性別', 'gender'],
  position: ['役職', '役職・肩書', 'position', '肩書'],
  participationType: ['参加形式', '参加区分', '参加種別', '出欠', '参加', 'participation'],
  memberType: ['区分', '会員区分', '種別', 'membertype', '会員種別'],
  meetingOnly: ['例会のみ', '例会だけ', '例会'],
  meetingAndParty: ['例会+懇親会', '例会＋懇親会', '例会+懇親', '例会と懇親会', '懇親会参加'],
  partyOnly: ['懇親会のみ', '懇親会だけ'],
  absent: ['欠席'],
  meal: ['食事', 'お弁当', '弁当', '食事希望', '昼食'],
  note: ['備考', 'メモ', 'note', 'コメント'],
};

export interface ColumnMap {
  name?: number;
  clubName?: number;
  gender?: number;
  position?: number;
  participationType?: number;
  memberType?: number;
  meetingOnly?: number;
  meetingAndParty?: number;
  partyOnly?: number;
  absent?: number;
  meal?: number;
  note?: number;
}

function headerKey(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\s\u3000\r\n\t]+/g, '')
    .toLowerCase();
}

/**
 * ヘッダー行から列マッピングを作る。
 * @returns 対応づけできた論理カラム数と ColumnMap
 */
export function detectColumns(headerRow: unknown[]): { map: ColumnMap; matched: number } {
  const map: ColumnMap = {};
  let matched = 0;

  headerRow.forEach((cell, idx) => {
    const key = headerKey(cell);
    if (!key) return;
    for (const [logical, aliases] of Object.entries(HEADER_ALIASES)) {
      if ((map as any)[logical] !== undefined) continue;
      if (aliases.some(a => headerKey(a) === key)) {
        (map as any)[logical] = idx;
        matched++;
        return;
      }
    }
  });

  return { map, matched };
}

/**
 * ヘッダー行を自動検出する（先頭に表題行があるシートに対応）。
 * 「氏名」列が見つかった行をヘッダーとみなす。
 */
export function findHeaderRow(rows: unknown[][]): { index: number; map: ColumnMap } | null {
  const limit = Math.min(rows.length, 15);
  let best: { index: number; map: ColumnMap; matched: number } | null = null;

  for (let i = 0; i < limit; i++) {
    const { map, matched } = detectColumns(rows[i] || []);
    if (map.name === undefined) continue;
    if (!best || matched > best.matched) best = { index: i, map, matched };
  }

  return best ? { index: best.index, map: best.map } : null;
}

// ============================================================
// 値の解釈
// ============================================================

/** ○ / ◯ / 〇 / ● / TRUE / 1 / はい などを true とみなす */
export function isMarked(value: unknown): boolean {
  if (value === true) return true;
  if (value === 1) return true;
  if (value === null || value === undefined) return false;
  const s = String(value).normalize('NFKC').replace(/[\s\u3000]/g, '').toLowerCase();
  if (!s) return false;
  return ['○', '◯', '〇', '●', '◎', '✓', '✔', 'x', '×', 'v', '1', 'true', 'yes', 'はい', 'あり', '有', '要', 'o'].includes(s);
}

/** 「例会のみ」等の文字列を participationType に変換 */
export function parseParticipationText(value: unknown): ParticipationType | null {
  if (value === null || value === undefined) return null;
  const s = String(value).normalize('NFKC').replace(/[\s\u3000]/g, '');
  if (!s) return null;

  if (/^(欠席|不参加|欠|×|x)$/i.test(s)) return 'absent';
  if (/懇親会のみ|懇親のみ|懇親会だけ|二次会のみ/.test(s)) return 'party_only';
  if (/例会\+?＋?懇親|例会と懇親|両方|フル/.test(s)) return 'meeting_and_party';
  if (/例会のみ|例会だけ|^例会$/.test(s)) return 'meeting_only';
  // 「出席」「参加」のみの記載は例会参加とみなす
  if (/^(出席|参加|出|○|◯|〇|●|◎|✓|✔|o|v|yes|true|1)$/i.test(s)) return 'meeting_only';
  return null;
}

/** 「区分」列や、クラブ名から会員区分を推定する */
export function inferMemberType(
  explicit: unknown,
  clubName: string | null,
): ImportMemberType {
  const raw = String(explicit ?? '').normalize('NFKC').replace(/[\s\u3000]/g, '').toUpperCase();
  if (raw) {
    if (/^(RAC|ローターアクト|アクター)$/.test(raw)) return 'RAC';
    if (/^(RC|ロータリアン|ロータリー)$/.test(raw)) return 'RC';
    if (/^(OBOG|OB_OG|OB|OG|OB・OG)$/.test(raw)) return 'OB_OG';
    if (/^(GUEST|ゲスト|来賓)$/.test(raw)) return 'GUEST';
  }

  // クラブ名からの推定
  const club = String(clubName ?? '').normalize('NFKC');
  if (/ゲスト|来賓|guest/i.test(club)) return 'GUEST';
  if (/ロータリークラブ|ロータリｰクラブ|(^|[^A-Za-z])RC([^A-Za-z]|$)/.test(club)) return 'RC';
  if (/OB|OG/.test(club)) return 'OB_OG';
  if (/ローターアクト|ロータアクト|RAC/i.test(club)) return 'RAC';

  // クラブ名なし → ゲスト扱いのほうが安全（登録料の取りこぼしを防ぐ）
  return club ? 'RAC' : 'GUEST';
}

/** 性別の正規化 */
export function normalizeGender(value: unknown): string | null {
  const s = String(value ?? '').normalize('NFKC').replace(/[\s\u3000]/g, '');
  if (!s) return null;
  if (/^(男|男性|m|male)$/i.test(s)) return '男';
  if (/^(女|女性|f|female)$/i.test(s)) return '女';
  return s.slice(0, 10);
}

// ============================================================
// 行の解析
// ============================================================

function cell(row: unknown[], idx: number | undefined): unknown {
  if (idx === undefined) return null;
  return row[idx] ?? null;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

/**
 * データ行1件を解析する。
 * @param row      セル配列
 * @param map      列マッピング
 * @param rowNumber 元ファイルの行番号（表示用）
 * @returns 空行なら null
 */
export function parseRow(row: unknown[], map: ColumnMap, rowNumber: number): ParsedRow | null {
  const errors: string[] = [];
  const warnings: string[] = [];

  const rawName = text(cell(row, map.name));
  const clubName = text(cell(row, map.clubName)) || null;

  // 「例」などの記入例の行はスキップ扱い（先頭列が「例」の場合）
  const firstCell = text(row[0]);
  if (/^(例|記入例|サンプル|example)$/i.test(firstCell)) return null;

  // 空行判定
  // ひな型には No 列にあらかじめ連番が入っているので、
  // 「No 列（マップに含まれない先頭列）以外に値があるか」で判定する。
  const mappedIndexes = new Set<number>(
    Object.values(map).filter((v): v is number => typeof v === 'number'),
  );
  const hasMeaningfulValue = row.some((v, i) => {
    if (text(v) === '') return false;
    // マップされていない先頭列（No 列）は無視
    if (i === 0 && !mappedIndexes.has(0)) return false;
    return true;
  });
  if (!rawName && !hasMeaningfulValue) return null;

  if (!rawName) {
    // 氏名がないが他の列に値がある → エラー行として残し、ユーザーに気づかせる
    errors.push('氏名が空です');
  }

  // ---- 参加形式の判定 ----
  // 1) 「参加形式」列のテキスト
  let participationType = parseParticipationText(cell(row, map.participationType));

  // 2) ○マーク形式（例会のみ / 例会+懇親会 / 懇親会のみ / 欠席 の各列）
  if (!participationType) {
    const meetingOnly = isMarked(cell(row, map.meetingOnly));
    const both = isMarked(cell(row, map.meetingAndParty));
    const partyOnly = isMarked(cell(row, map.partyOnly));
    const absent = isMarked(cell(row, map.absent));

    if (absent) participationType = 'absent';
    else if (both) participationType = 'meeting_and_party';
    else if (partyOnly) participationType = 'party_only';
    else if (meetingOnly) participationType = 'meeting_only';

    if (both && meetingOnly) {
      warnings.push('「例会のみ」と「例会+懇親会」の両方に印があります（例会+懇親会として取り込みます）');
    }

    // 「例会のみ」列に "懇親会のみ" のような文字が直接書かれているケース
    if (!participationType) {
      for (const idx of [map.meetingOnly, map.meetingAndParty, map.partyOnly]) {
        const t = parseParticipationText(cell(row, idx));
        if (t) { participationType = t; break; }
      }
    }
  }

  if (!participationType) {
    participationType = 'meeting_only';
    if (rawName) warnings.push('参加形式が読み取れないため「例会のみ」として取り込みます');
  }

  const memberType = inferMemberType(cell(row, map.memberType), clubName);

  // ---- 食事 ----
  // 明示列があればそれを使う。なければ未指定（false）
  const mealRequired = map.meal !== undefined ? isMarked(cell(row, map.meal)) : false;

  if (!clubName && rawName) {
    warnings.push('クラブ名が空です（ゲストとして扱われる場合があります）');
  }

  return {
    rowNumber,
    name: rawName,
    nameKey: normalizeName(rawName),
    clubName,
    gender: normalizeGender(cell(row, map.gender)),
    position: text(cell(row, map.position)) || null,
    participationType,
    memberType,
    mealRequired,
    note: text(cell(row, map.note)) || null,
    errors,
    warnings,
  };
}

/**
 * シート全体（2次元配列）を解析する。
 */
export function parseSheet(rows: unknown[][]): {
  header: { index: number; map: ColumnMap } | null;
  rows: ParsedRow[];
  skippedEmpty: number;
} {
  const header = findHeaderRow(rows);
  if (!header) return { header: null, rows: [], skippedEmpty: 0 };

  const parsed: ParsedRow[] = [];
  let skippedEmpty = 0;

  for (let i = header.index + 1; i < rows.length; i++) {
    const r = parseRow(rows[i] || [], header.map, i + 1);
    if (r) parsed.push(r);
    else skippedEmpty++;
  }

  return { header, rows: parsed, skippedEmpty };
}

// ============================================================
// 重複判定
// ============================================================

export interface ExistingAttendance {
  id: string;
  /** 表示名（users.name か external_name） */
  displayName: string;
  clubName: string | null;
  userId: string | null;
  participationType: string | null;
}

/**
 * 解析済みの行に対し、既存の出席レコードおよびファイル内の重複を判定する。
 *
 * 判定キー: 氏名（正規化） + クラブ名（正規化）
 * クラブ名が空の行は氏名のみで判定する（同姓同名の誤検出より、
 * 二重登録を防ぐことを優先する）。
 */
export function detectDuplicates(
  rows: ParsedRow[],
  existing: ExistingAttendance[],
): RowWithDuplicate[] {
  // 既存レコードのインデックス
  const byNameClub = new Map<string, ExistingAttendance>();
  const byName = new Map<string, ExistingAttendance[]>();

  for (const e of existing) {
    const nk = normalizeName(e.displayName);
    if (!nk) continue;
    const ck = normalizeClubName(e.clubName);
    byNameClub.set(`${nk}|${ck}`, e);
    const list = byName.get(nk) || [];
    list.push(e);
    byName.set(nk, list);
  }

  const seenInFile = new Map<string, ParsedRow>();
  const result: RowWithDuplicate[] = [];

  for (const row of rows) {
    const nk = row.nameKey;
    const ck = normalizeClubName(row.clubName);
    const fileKey = `${nk}|${ck}`;

    // 1) ファイル内の重複
    if (nk && seenInFile.has(fileKey)) {
      const first = seenInFile.get(fileKey)!;
      result.push({
        ...row,
        duplicate: 'duplicate_in_file',
        duplicateOf: {
          displayName: first.name,
          clubName: first.clubName,
          participationType: first.participationType,
          rowNumber: first.rowNumber,
          conflicting: first.participationType !== row.participationType,
        },
      });
      continue;
    }
    if (nk) seenInFile.set(fileKey, row);

    // 2) 既存の出席レコードとの重複
    let match: ExistingAttendance | undefined;
    if (nk) {
      match = byNameClub.get(fileKey);
      if (!match) {
        // クラブ名の表記ゆれ・空欄を考慮して氏名のみでも照合
        const candidates = byName.get(nk) || [];
        if (candidates.length === 1) match = candidates[0];
        else if (candidates.length > 1) {
          // 複数該当（同姓同名）→ クラブ名一致を優先、なければ先頭
          match = candidates.find(c => normalizeClubName(c.clubName) === ck) || candidates[0];
        }
      }
    }

    if (match) {
      result.push({
        ...row,
        duplicate: 'existing_attendance',
        duplicateOf: {
          attendanceId: match.id,
          displayName: match.displayName,
          clubName: match.clubName,
          participationType: match.participationType,
          conflicting: match.participationType !== row.participationType,
        },
        matchedUserId: match.userId,
      });
      continue;
    }

    result.push({ ...row, duplicate: 'none' });
  }

  return result;
}

/** 取り込みサマリー */
export interface ImportSummary {
  total: number;
  importable: number;
  duplicateExisting: number;
  duplicateInFile: number;
  errorRows: number;
  warningRows: number;
}

export function summarize(rows: RowWithDuplicate[]): ImportSummary {
  return {
    total: rows.length,
    importable: rows.filter(r => r.duplicate === 'none' && r.errors.length === 0).length,
    duplicateExisting: rows.filter(r => r.duplicate === 'existing_attendance').length,
    duplicateInFile: rows.filter(r => r.duplicate === 'duplicate_in_file').length,
    errorRows: rows.filter(r => r.errors.length > 0).length,
    warningRows: rows.filter(r => r.warnings.length > 0).length,
  };
}

// ============================================================
// 参加費の算出
// ============================================================

export interface MeetingFees {
  feeRac: number;
  feeRc: number;
  feeObog: number;
  feeGuest: number;
  afterPartyFeeRac: number;
  afterPartyFeeRc: number;
  afterPartyFeeObog: number;
  afterPartyFeeGuest: number;
  /** 自クラブ会員の登録料（null = 0円） */
  ownClubFee?: number | null;
}

/**
 * 会員区分と参加形式から登録料・懇親会費を算出する。
 * アプリ側の登録（/api/my/attendance）と同じ考え方に揃える。
 */
export function calcFees(
  memberType: ImportMemberType,
  participationType: ParticipationType,
  fees: MeetingFees,
  isOwnClub = false,
): { feeAmount: number; afterPartyFeeAmount: number } {
  if (participationType === 'absent') {
    return { feeAmount: 0, afterPartyFeeAmount: 0 };
  }

  let feeAmount = 0;
  if (participationType !== 'party_only') {
    if (isOwnClub && fees.ownClubFee != null) {
      feeAmount = fees.ownClubFee;
    } else if (isOwnClub) {
      feeAmount = 0;
    } else if (memberType === 'RAC') feeAmount = fees.feeRac || 0;
    else if (memberType === 'RC') feeAmount = fees.feeRc || 0;
    else if (memberType === 'OB_OG') feeAmount = fees.feeObog || 0;
    else feeAmount = fees.feeGuest || 0;
  }

  let afterPartyFeeAmount = 0;
  if (participationType === 'meeting_and_party' || participationType === 'party_only') {
    if (memberType === 'RAC') afterPartyFeeAmount = fees.afterPartyFeeRac || 0;
    else if (memberType === 'RC') afterPartyFeeAmount = fees.afterPartyFeeRc || 0;
    else if (memberType === 'OB_OG') afterPartyFeeAmount = fees.afterPartyFeeObog || 0;
    else afterPartyFeeAmount = fees.afterPartyFeeGuest || 0;
  }

  return { feeAmount, afterPartyFeeAmount };
}

// ============================================================
// CSV パース（軽量・依存なし）
// ============================================================

/**
 * CSV テキストを2次元配列にする。
 * ダブルクォート・改行入りセル・CRLF に対応。
 */
export function parseCsv(input: string): string[][] {
  // BOM 除去
  const s = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }

  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
