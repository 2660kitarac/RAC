/**
 * 表データを CSV / Excel(.xlsx) で書き出す（ブラウザ専用）
 *
 * - CSV は Excel で文字化けしないよう BOM 付き UTF-8
 * - Excel は exceljs を必要なときだけ読み込む（初回表示を重くしないため）
 */

export type Cell = string | number | null | undefined;

export interface ExportTable {
  /** 見出し行 */
  header: string[];
  /** データ行 */
  rows: Cell[][];
}

/** ファイル名に使えない文字を置き換える */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim() || 'export';
}

/**
 * 表計算ソフトで数式として解釈されないようにする（CSVインジェクション対策）
 * = + - @ やタブ・改行で始まる文字列の先頭に ' を付ける
 */
function neutralize(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari では即時に破棄するとダウンロードが失敗することがある
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(table: ExportTable): string {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return '""';
    const s = typeof v === 'number' ? String(v) : neutralize(String(v));
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [table.header, ...table.rows].map(r => r.map(esc).join(',')).join('\r\n');
}

export function downloadCsv(table: ExportTable, baseName: string) {
  const blob = new Blob(['﻿' + toCsv(table)], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${safeFileName(baseName)}.csv`);
}

export async function downloadXlsx(
  table: ExportTable,
  baseName: string,
  opts: { sheetName?: string; title?: string } = {},
) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RAC Cloud';
  // シート名は31文字まで・一部記号は使えない
  const sheetName = (opts.sheetName || '参加者一覧').replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
  const ws = wb.addWorksheet(sheetName);

  if (opts.title) {
    ws.addRow([opts.title]).font = { bold: true, size: 13 };
    ws.addRow([]);
  }

  const headerRow = ws.addRow(table.header);
  headerRow.font = { bold: true };
  headerRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
    c.border = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
    c.alignment = { vertical: 'middle' };
  });

  for (const r of table.rows) {
    ws.addRow(r.map(v => (v === null || v === undefined ? '' : typeof v === 'number' ? v : neutralize(String(v)))));
  }

  // 見出しを固定し、列幅を内容に合わせる（全角は2文字分で概算）
  ws.views = [{ state: 'frozen', ySplit: headerRow.number }];
  table.header.forEach((h, i) => {
    const width = [h, ...table.rows.map(r => r[i])].reduce<number>((max, v) => {
      const s = v === null || v === undefined ? '' : String(v);
      const len = Array.from(s.split('\n')[0]).reduce((n, ch) => n + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0);
      return Math.max(max, len);
    }, 4);
    ws.getColumn(i + 1).width = Math.min(Math.max(width + 2, 8), 50);
  });
  ws.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: table.header.length },
  };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `${safeFileName(baseName)}.xlsx`);
}
