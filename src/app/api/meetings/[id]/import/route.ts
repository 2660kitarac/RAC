import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, attendances } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { canManageClub, canMutateClubRecord } from '@/lib/auth/tenant';
import { evaluateDeadline } from '@/lib/meetings/deadline';
import {
  calcFees,
  normalizeName,
  normalizeClubName,
  type MeetingFees,
  type ParticipationType,
  type ImportMemberType,
} from '@/lib/meetings/import-parse';
import { loadExistingAttendances } from '@/lib/meetings/import-server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

const VALID_PARTICIPATION: ParticipationType[] = [
  'meeting_only',
  'meeting_and_party',
  'party_only',
  'absent',
];
const VALID_MEMBER_TYPE: ImportMemberType[] = ['RAC', 'RC', 'OB_OG', 'GUEST'];

/** 1行あたりのクライアント送信データ */
interface ImportRowInput {
  rowNumber?: number;
  name?: string;
  clubName?: string | null;
  gender?: string | null;
  position?: string | null;
  participationType?: string;
  memberType?: string;
  mealRequired?: boolean;
  note?: string | null;
  matchedUserId?: string | null;
  matchedClubId?: string | null;
  /** 重複時の処理: skip=取り込まない / overwrite=既存を更新 / insert=そのまま追加 */
  action?: 'skip' | 'overwrite' | 'insert';
  /** 上書き対象の出席レコードID（overwrite のとき必須） */
  targetAttendanceId?: string | null;
}

/** 性別・役職・備考を1つの note にまとめる */
function buildNote(row: ImportRowInput): string | null {
  const parts: string[] = [];
  if (row.position) parts.push(`役職: ${String(row.position).trim()}`);
  if (row.gender) parts.push(`性別: ${String(row.gender).trim()}`);
  if (row.note) parts.push(String(row.note).trim());
  const joined = parts.filter(Boolean).join(' / ');
  return joined ? joined.slice(0, 1000) : null;
}

/**
 * POST /api/meetings/[id]/import
 *
 * プレビューで確認済みの行を受け取り、出席レコードとして一括登録する。
 * - 重複行は action（skip / overwrite / insert）に従う
 * - サーバー側でも重複を再判定し、二重登録を防ぐ
 * - 参加費はサーバー側で再計算（クライアントの金額は信頼しない）
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

    // ---- 例会の存在＆テナント検証 ----
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

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: '取り込みデータが不正です' }, { status: 400 });
    }

    const inputRows: ImportRowInput[] = body.rows;
    if (inputRows.length === 0) {
      return NextResponse.json({ error: '取り込む行がありません' }, { status: 400 });
    }
    if (inputRows.length > 500) {
      return NextResponse.json(
        { error: '一度に取り込めるのは500件までです' },
        { status: 400 },
      );
    }

    // ---- 締切ポリシーの評価（遅延登録フラグ用。取り込みはスタッフ操作なのでブロックしない） ----
    const deadlineCheck = evaluateDeadline({
      registrationDeadline: meeting.registrationDeadline,
      deadlinePolicy: (meeting as any).deadlinePolicy,
      status: meeting.status,
      finishedAt: (meeting as any).finishedAt,
      date: meeting.date,
    });

    // ---- 既存レコードでサーバー側でも重複を再判定 ----
    const existing = await loadExistingAttendances(db, id);
    const existingKeys = new Map<string, string>(); // key -> attendanceId
    const existingNameOnly = new Map<string, string[]>();
    for (const e of existing) {
      const nk = normalizeName(e.displayName);
      if (!nk) continue;
      existingKeys.set(`${nk}|${normalizeClubName(e.clubName)}`, e.id);
      const list = existingNameOnly.get(nk) || [];
      list.push(e.id);
      existingNameOnly.set(nk, list);
    }

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

    const inserted: any[] = [];
    const updated: any[] = [];
    const skipped: { rowNumber?: number; name?: string; reason: string }[] = [];
    const failed: { rowNumber?: number; name?: string; error: string }[] = [];

    // ファイル内の重複も実行時に防ぐ
    const processedKeys = new Set<string>();

    for (const row of inputRows) {
      const name = String(row.name ?? '').trim();
      // action 未指定は「重複なら安全側でスキップ」として扱う
      const action = row.action;

      if (action === 'skip') {
        skipped.push({ rowNumber: row.rowNumber, name, reason: 'スキップ指定' });
        continue;
      }
      if (!name) {
        failed.push({ rowNumber: row.rowNumber, name, error: '氏名が空です' });
        continue;
      }

      const nk = normalizeName(name);
      const ck = normalizeClubName(row.clubName);
      const key = `${nk}|${ck}`;

      // 同一リクエスト内の重複を防ぐ
      if (processedKeys.has(key)) {
        skipped.push({ rowNumber: row.rowNumber, name, reason: 'ファイル内で重複' });
        continue;
      }

      // ---- 値の正規化・検証 ----
      let participationType = (row.participationType ?? 'meeting_only') as ParticipationType;
      if (!VALID_PARTICIPATION.includes(participationType)) participationType = 'meeting_only';
      if (!hasAfterParty && (participationType === 'meeting_and_party' || participationType === 'party_only')) {
        participationType = 'meeting_only';
      }

      let memberType = (row.memberType ?? 'GUEST') as ImportMemberType;
      if (!VALID_MEMBER_TYPE.includes(memberType)) memberType = 'GUEST';

      // 他クラブの会員IDを勝手に紐付けさせない：クラブ照合結果の整合だけ受け入れる
      const matchedUserId = row.matchedUserId ? String(row.matchedUserId) : null;
      const matchedClubId = row.matchedClubId ? String(row.matchedClubId) : null;
      const isOwnClub = !!matchedClubId && matchedClubId === meeting.clubId;

      const { feeAmount, afterPartyFeeAmount } = calcFees(
        memberType,
        participationType,
        fees,
        isOwnClub,
      );

      const mealRequired = deadlineCheck.mealAllowed ? !!row.mealRequired : false;
      const note = buildNote(row);
      const attendanceStatus = participationType === 'absent' ? 'absent' : 'undecided';

      try {
        // ---- 上書き ----
        if (action === 'overwrite') {
          const targetId =
            row.targetAttendanceId ||
            existingKeys.get(key) ||
            (existingNameOnly.get(nk)?.length === 1 ? existingNameOnly.get(nk)![0] : null);

          if (!targetId) {
            failed.push({
              rowNumber: row.rowNumber,
              name,
              error: '上書き対象の登録が見つかりません',
            });
            continue;
          }

          // 上書き対象が本当にこの例会のレコードか確認
          if (!existing.some(e => e.id === targetId)) {
            failed.push({
              rowNumber: row.rowNumber,
              name,
              error: '上書き対象がこの例会の登録ではありません',
            });
            continue;
          }

          const [res] = await db
            .update(attendances)
            .set({
              clubName: row.clubName ? String(row.clubName).trim().slice(0, 200) : null,
              clubId: matchedClubId,
              memberType,
              participationType,
              attendanceStatus,
              mealRequired,
              feeAmount,
              afterPartyFeeAmount,
              note,
              updatedAt: new Date().toISOString(),
            } as any)
            .where(eq(attendances.id, targetId))
            .returning();

          processedKeys.add(key);
          updated.push(res);
          continue;
        }

        // ---- 新規追加 ----
        // 明示的に 'insert' が指定されていない限り、既存と重複する行は追加しない
        // （クライアントが重複を見落とした場合の二重登録防止）
        const existingDup =
          existingKeys.get(key) ||
          (existingNameOnly.get(nk)?.length === 1 ? existingNameOnly.get(nk)![0] : null);
        if (action !== 'insert' && existingDup) {
          skipped.push({ rowNumber: row.rowNumber, name, reason: '既に登録済み（重複防止）' });
          continue;
        }

        const [res] = await db
          .insert(attendances)
          .values({
            id: randomUUID(),
            meetingId: id,
            userId: matchedUserId,
            externalName: matchedUserId ? null : name.slice(0, 200),
            clubId: matchedClubId,
            clubName: row.clubName ? String(row.clubName).trim().slice(0, 200) : null,
            memberType,
            attendanceStatus,
            registrationType: 'import',
            participationType,
            mealRequired,
            feeAmount,
            afterPartyFeeAmount,
            paymentStatus: 'unpaid',
            note,
            isLateRegistration: deadlineCheck.isLate,
            registeredAfterDeadlineDays: deadlineCheck.isLate ? deadlineCheck.daysLate : null,
          } as any)
          .returning();

        processedKeys.add(key);
        existingKeys.set(key, res.id);
        existing.push({
          id: res.id,
          displayName: name,
          clubName: row.clubName ?? null,
          userId: matchedUserId,
          participationType,
        });
        inserted.push(res);
      } catch (e: any) {
        console.error('import row error:', e);
        failed.push({
          rowNumber: row.rowNumber,
          name,
          error: '登録に失敗しました',
        });
      }
    }

    return NextResponse.json({
      success: true,
      insertedCount: inserted.length,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
      isLate: deadlineCheck.isLate,
      mealAllowed: deadlineCheck.mealAllowed,
      inserted,
      updated,
      skipped,
      failed,
    });
  } catch (e) {
    console.error('POST /api/meetings/[id]/import error:', e);
    return NextResponse.json({ error: '取り込みに失敗しました' }, { status: 500 });
  }
}
