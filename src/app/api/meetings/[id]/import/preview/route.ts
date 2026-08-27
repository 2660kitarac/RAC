import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canManageClub, canMutateClubRecord } from '@/lib/auth/tenant';
import {
  parseSheet,
  detectDuplicates,
  summarize,
  calcFees,
  type MeetingFees,
} from '@/lib/meetings/import-parse';
import {
  loadRowsFromFile,
  loadExistingAttendances,
  matchClubsAndUsers,
  MAX_FILE_SIZE,
  ACCEPTED_EXTENSIONS,
} from '@/lib/meetings/import-server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/meetings/[id]/import/preview
 *
 * multipart/form-data で受け取ったスプレッドシートを解析し、
 * 重複判定・参加費算出まで済ませたプレビューを返す（DBは変更しない）。
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }
    if (!canManageClub((session.user as any).role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getDbFromContext();

    // ---- 例会の存在＆テナント検証（IDOR 対策） ----
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .limit(1);

    if (!meeting) {
      return NextResponse.json({ error: '例会が見つかりません' }, { status: 404 });
    }
    if (!canMutateClubRecord(session.user as any, meeting.clubId)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    // ---- ファイル受け取り ----
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'ファイルの受信に失敗しました' },
        { status: 400 },
      );
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });
    }

    const filename = (file as File).name || '';
    const lower = filename.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some(ext => lower.endsWith(ext))) {
      return NextResponse.json(
        {
          error:
            '対応していないファイル形式です（.xlsx / .csv をアップロードしてください）。旧形式の .xls は Excel で .xlsx として保存し直してください。',
        },
        { status: 400 },
      );
    }
    if ((file as File).size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'ファイルサイズが大きすぎます（上限 5MB）' },
        { status: 400 },
      );
    }

    const buffer = await (file as File).arrayBuffer();

    // ---- 解析 ----
    let loaded;
    try {
      loaded = await loadRowsFromFile(buffer, filename);
    } catch (e) {
      console.error('import preview parse error:', e);
      return NextResponse.json(
        { error: 'ファイルを読み込めませんでした。ファイルが壊れていないか確認してください。' },
        { status: 400 },
      );
    }

    const parsed = parseSheet(loaded.rows);

    if (!parsed.header) {
      return NextResponse.json(
        {
          error:
            '「氏名」列が見つかりませんでした。ひな型をダウンロードして列名を合わせるか、ヘッダ行に「氏名」を含めてください。',
        },
        { status: 400 },
      );
    }
    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: '取り込める行がありませんでした（データ行が空です）' },
        { status: 400 },
      );
    }

    // ---- 重複判定 ----
    const existing = await loadExistingAttendances(db, id);
    let rows = detectDuplicates(parsed.rows, existing);
    rows = await matchClubsAndUsers(db, rows);

    // ---- 参加費の算出 ----
    const fees: MeetingFees = {
      feeRac: meeting.feeRac ?? 0,
      feeRc: meeting.feeRc ?? 0,
      feeObog: meeting.feeObog ?? 0,
      feeGuest: meeting.feeGuest ?? 0,
      afterPartyFeeRac: meeting.afterPartyFeeRac ?? 0,
      afterPartyFeeRc: meeting.afterPartyFeeRc ?? 0,
      afterPartyFeeObog: meeting.afterPartyFeeObog ?? 0,
      afterPartyFeeGuest: meeting.afterPartyFeeGuest ?? 0,
      ownClubFee: meeting.ownClubFee ?? null,
    };

    const hasAfterParty = !!meeting.hasAfterParty;

    const enriched = rows.map(r => {
      // 懇親会が無い例会に懇親会参加の行が来た場合は例会のみに寄せる
      let participationType = r.participationType;
      const warnings = [...r.warnings];
      if (!hasAfterParty && (participationType === 'meeting_and_party' || participationType === 'party_only')) {
        warnings.push('この例会は懇親会がないため「例会のみ」として取り込みます');
        participationType = 'meeting_only';
      }

      const isOwnClub = !!r.matchedClubId && r.matchedClubId === meeting.clubId;
      const { feeAmount, afterPartyFeeAmount } = calcFees(
        r.memberType,
        participationType,
        fees,
        isOwnClub,
      );

      return {
        ...r,
        participationType,
        warnings,
        isOwnClub,
        feeAmount,
        afterPartyFeeAmount,
      };
    });

    return NextResponse.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        date: meeting.date,
        hasAfterParty,
        clubId: meeting.clubId,
      },
      file: {
        name: filename,
        sheetName: loaded.sheetName,
        headerRowNumber: parsed.header.index + 1,
        skippedEmpty: parsed.skippedEmpty,
      },
      columns: parsed.header.map,
      warnings: loaded.warnings,
      rows: enriched,
      summary: summarize(rows),
      existingCount: existing.length,
    });
  } catch (e) {
    console.error('POST /api/meetings/[id]/import/preview error:', e);
    return NextResponse.json(
      { error: 'ファイルの解析に失敗しました' },
      { status: 500 },
    );
  }
}
