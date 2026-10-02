import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { canManageClub } from '@/lib/auth/tenant';

export const runtime = 'nodejs';

/**
 * GET /api/meetings/import-template
 *
 * スプレッドシート取り込み用の Excel ひな型（.xlsx）を生成して返す。
 * - 1行目: 説明（記入方法）
 * - 2行目: ヘッダ行（No / クラブ名 / 氏名 / 性別 / 参加形式 / 役職 / 食事 / 備考）
 * - 3行目: 記入例（取り込み時は自動的にスキップされる）
 * - 4行目以降: 入力欄（参加形式はドロップダウン）
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }
    if (!canManageClub((session.user as any).role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    // exceljs は重いので動的 import
    const ExcelJS = (await import('exceljs')).default;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'RAC CLOUD';
    wb.created = new Date();

    const ws = wb.addWorksheet('登録用紙', {
      views: [{ state: 'frozen', ySplit: 3 }],
    });

    // ---- 列幅 ----
    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'club', width: 30 },
      { key: 'name', width: 18 },
      { key: 'gender', width: 8 },
      { key: 'participation', width: 18 },
      { key: 'position', width: 18 },
      { key: 'meal', width: 8 },
      { key: 'note', width: 30 },
    ];

    // ---- 1行目: 説明 ----
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value =
      '例会 出席者取り込み用シート ／ 3行目は記入例です（取り込み時は自動でスキップされます）。4行目から入力してください。';
    titleCell.font = { bold: true, size: 11, color: { argb: 'FF1F4E79' } };
    titleCell.alignment = { vertical: 'middle', wrapText: true };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDEEBF7' },
    };
    ws.getRow(1).height = 32;

    // ---- 2行目: ヘッダ ----
    const HEADERS = [
      'No',
      'クラブ名',
      '氏名',
      '性別',
      '参加形式',
      '役職',
      '食事',
      '備考',
    ];
    const headerRow = ws.getRow(2);
    HEADERS.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E75B6' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    headerRow.height = 22;

    // ---- 3行目: 記入例 ----
    const sample = [
      '例',
      '大阪北ローターアクトクラブ',
      '山田太郎',
      '男',
      '例会+懇親会',
      '会長',
      '要',
      'アレルギー：えび',
    ];
    const sampleRow = ws.getRow(3);
    sample.forEach((v, i) => {
      const cell = sampleRow.getCell(i + 1);
      cell.value = v;
      cell.font = { italic: true, color: { argb: 'FF808080' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' },
      };
    });

    // ---- 4行目以降: 入力欄 + 罫線 + No 連番 ----
    const LAST_ROW = 203; // 200件分
    for (let r = 4; r <= LAST_ROW; r++) {
      const row = ws.getRow(r);
      row.getCell(1).value = r - 3;
      for (let c = 1; c <= HEADERS.length; c++) {
        row.getCell(c).border = {
          top: { style: 'hair', color: { argb: 'FFBFBFBF' } },
          left: { style: 'hair', color: { argb: 'FFBFBFBF' } },
          bottom: { style: 'hair', color: { argb: 'FFBFBFBF' } },
          right: { style: 'hair', color: { argb: 'FFBFBFBF' } },
        };
      }
    }

    // ---- 入力規則（ドロップダウン） ----
    // 参加形式（E列）
    for (let r = 4; r <= LAST_ROW; r++) {
      ws.getCell(`E${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"例会のみ,例会+懇親会,懇親会のみ,欠席"'],
        showErrorMessage: true,
        errorTitle: '参加形式',
        error: '例会のみ / 例会+懇親会 / 懇親会のみ / 欠席 から選択してください',
      };
      // 性別（D列）
      ws.getCell(`D${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"男,女"'],
        showErrorMessage: false,
      };
      // 食事（G列）
      ws.getCell(`G${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"要,不要"'],
        showErrorMessage: false,
      };
    }

    // ---- 記入方法シート ----
    const guide = wb.addWorksheet('記入方法');
    guide.columns = [{ width: 16 }, { width: 70 }];
    const guideRows: [string, string][] = [
      ['項目', '説明'],
      ['No', '任意。空欄でも構いません。'],
      [
        'クラブ名',
        '必須ではありませんが、重複判定の精度が上がるため入力を推奨します。「〜ローターアクトクラブ」「〜RAC」「〜ロータリークラブ」「ゲスト（〜）」などの表記に対応しています。',
      ],
      ['氏名', '必須。姓名の間のスペースは有無どちらでも構いません。'],
      ['性別', '男 / 女。備考として取り込まれます。'],
      [
        '参加形式',
        '例会のみ / 例会+懇親会 / 懇親会のみ / 欠席 のいずれか。「出席」「〇」のみでも例会のみとして取り込みます。',
      ],
      ['役職', '会長・幹事など。備考として取り込まれます。'],
      ['食事', '要 / 不要。空欄は「不要」として扱います。'],
      ['備考', 'アレルギーや連絡事項など自由入力。'],
      [
        '重複について',
        'アプリ側で既に登録済みの方は、取り込み画面で「重複」として表示されます。スキップ / 上書き / そのまま追加を行ごとに選べます。',
      ],
      [
        '既存シートの利用',
        'このひな型以外でも、「氏名」列があるシートなら自動でヘッダを検出して取り込めます。「例会のみ」「例会+懇親会」の2列に○を付ける形式にも対応しています。',
      ],
    ];
    guideRows.forEach((r, i) => {
      const row = guide.addRow(r);
      if (i === 0) {
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.eachCell(c => {
          c.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2E75B6' },
          };
        });
      }
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    });

    const buffer = await wb.xlsx.writeBuffer();
    const filename = 'rac-cloud-attendance-import-template.xlsx';

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent('例会出席取り込みひな型.xlsx')}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('GET /api/meetings/import-template error:', e);
    return NextResponse.json(
      { error: 'ひな型の生成に失敗しました' },
      { status: 500 },
    );
  }
}
