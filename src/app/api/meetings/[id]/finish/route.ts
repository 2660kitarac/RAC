/**
 * 例会終了処理（クロージング）API
 *
 *   GET    /api/meetings/[id]/finish  … 終了可否の事前チェック（未回答・未払い件数など）
 *   POST   /api/meetings/[id]/finish  … 例会を終了する
 *   DELETE /api/meetings/[id]/finish  … 終了を取り消す（status を closed に戻す）
 *
 * 設計方針:
 *  - 未回答（undecided）の参加者が 1 名でも残っている場合は終了できない（400）
 *    → 出席/ 欠席を確定させてから終了する運用にする
 *  - 会計への自動計上は行わない（会計は /finance 側で手動計上する運用）
 *  - 自クラブの例会のみ操作可能（canMutateClubRecord によるテナント検証）
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, attendances, meetingReports } from '@/lib/db/schema';
import { eq, and, isNull, count } from 'drizzle-orm';
import { canMutateClubRecord, isDistrictScope } from '@/lib/auth/tenant';

/** 例会管理が可能なロール（useAuth.canManageMeetings と同じ定義をサーバー側で保持） */
const MEETING_MANAGER_ROLES = [
  'system_owner', 'district_admin', 'club_account', 'club_admin', 'president', 'secretary',
  'district_representative', 'district_secretary',
];

function canManage(role: string | null | undefined): boolean {
  return !!role && MEETING_MANAGER_ROLES.includes(role);
}

type SessionUser = { id?: string | null; role?: string | null; clubId?: string | null };

/**
 * 例会を取得し、操作権限を検証する。
 * 戻り値が NextResponse の場合はそのままエラーレスポンスとして返す。
 */
async function loadAndAuthorize(db: any, sessionUser: SessionUser, id: string) {
  const [meeting] = await db
    .select({
      id: meetings.id,
      clubId: meetings.clubId,
      title: meetings.title,
      date: meetings.date,
      status: meetings.status,
      finishedAt: meetings.finishedAt,
    })
    .from(meetings)
    .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
    .limit(1);

  if (!meeting) {
    return { error: NextResponse.json({ error: '例会が見つかりません' }, { status: 404 }) };
  }

  if (!canManage(sessionUser.role)) {
    return { error: NextResponse.json({ error: '例会を終了する権限がありません' }, { status: 403 }) };
  }

  if (!canMutateClubRecord(sessionUser, meeting.clubId)) {
    return { error: NextResponse.json({ error: '他クラブの例会は操作できません' }, { status: 403 }) };
  }

  return { meeting };
}

/** 未回答 / 未払い / 参加者数 と報告書の有無を集計 */
async function loadReadiness(db: any, id: string) {
  const attendanceRows = await db
    .select({
      attendanceStatus: attendances.attendanceStatus,
      paymentStatus: attendances.paymentStatus,
      participationType: attendances.participationType,
    })
    .from(attendances)
    .where(and(eq(attendances.meetingId, id), isNull(attendances.deletedAt)));

  const reportRows = await db
    .select({ value: count() })
    .from(meetingReports)
    .where(and(eq(meetingReports.meetingId, id), isNull(meetingReports.deletedAt)));

  // 「未回答」= attendance_status が undecided
  const undecidedCount = attendanceRows.filter(
    (a: any) => a.attendanceStatus === 'undecided'
  ).length;

  // 未払い（欠席者は対象外）
  const unpaidCount = attendanceRows.filter(
    (a: any) => a.paymentStatus === 'unpaid' && a.attendanceStatus !== 'absent'
  ).length;

  return {
    totalCount: attendanceRows.length,
    presentCount: attendanceRows.filter((a: any) => a.attendanceStatus === 'present').length,
    absentCount: attendanceRows.filter((a: any) => a.attendanceStatus === 'absent').length,
    undecidedCount,
    unpaidCount,
    hasReport: (reportRows[0]?.value ?? 0) > 0,
  };
}

// ============================================================
// GET: 終了可否の事前チェック
// ============================================================
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();
    const sessionUser = session.user as SessionUser;

    const result = await loadAndAuthorize(db, sessionUser, id);
    if ('error' in result) return result.error;
    const { meeting } = result;

    const readiness = await loadReadiness(db, id);

    // 終了可能かどうか
    const alreadyFinished = meeting.status === 'finished';
    const cancelled = meeting.status === 'cancelled';
    const blockers: string[] = [];
    if (alreadyFinished) blockers.push('この例会は既に終了しています');
    if (cancelled) blockers.push('中止された例会は終了処理できません');
    if (readiness.undecidedCount > 0) {
      blockers.push(`未回答が${readiness.undecidedCount}名います。出席／欠席を確定してから終了してください`);
    }

    return NextResponse.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        date: meeting.date,
        status: meeting.status,
        finishedAt: meeting.finishedAt,
      },
      ...readiness,
      canFinish: blockers.length === 0,
      blockers,
    });
  } catch (e: any) {
    console.error('GET /api/meetings/[id]/finish error:', e);
    return NextResponse.json({ error: e?.message || '終了状態の取得に失敗しました' }, { status: 500 });
  }
}

// ============================================================
// POST: 例会を終了する
// ============================================================
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();
    const sessionUser = session.user as SessionUser;

    const result = await loadAndAuthorize(db, sessionUser, id);
    if ('error' in result) return result.error;
    const { meeting } = result;

    if (meeting.status === 'finished') {
      return NextResponse.json({ error: 'この例会は既に終了しています' }, { status: 400 });
    }
    if (meeting.status === 'cancelled') {
      return NextResponse.json({ error: '中止された例会は終了処理できません' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const closingNote: string | null =
      typeof body?.closingNote === 'string' && body.closingNote.trim() !== ''
        ? body.closingNote.trim()
        : null;

    // ---- 未回答が残っている場合は終了させない ----
    const readiness = await loadReadiness(db, id);
    if (readiness.undecidedCount > 0) {
      return NextResponse.json(
        {
          error: `未回答が${readiness.undecidedCount}名います。出席／欠席を確定してから終了してください`,
          code: 'UNDECIDED_REMAINING',
          undecidedCount: readiness.undecidedCount,
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // テナント防御: 自クラブ条件を WHERE にも入れる（地区スタッフは除外）
    const scopeCondition = isDistrictScope(sessionUser.role)
      ? undefined
      : eq(meetings.clubId, sessionUser.clubId as string);

    await db
      .update(meetings)
      .set({
        status: 'finished',
        finishedAt: now,
        finishedBy: sessionUser.id ?? null,
        attendanceFinalized: true,
        closingNote,
        updatedAt: now,
      } as any)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt), scopeCondition));

    return NextResponse.json({
      success: true,
      message: '例会を終了しました',
      finishedAt: now,
      summary: {
        totalCount: readiness.totalCount,
        presentCount: readiness.presentCount,
        absentCount: readiness.absentCount,
        unpaidCount: readiness.unpaidCount,
        hasReport: readiness.hasReport,
      },
    });
  } catch (e: any) {
    console.error('POST /api/meetings/[id]/finish error:', e);
    return NextResponse.json({ error: e?.message || '例会の終了処理に失敗しました' }, { status: 500 });
  }
}

// ============================================================
// DELETE: 終了を取り消す（status を closed に戻す）
// ============================================================
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();
    const sessionUser = session.user as SessionUser;

    const result = await loadAndAuthorize(db, sessionUser, id);
    if ('error' in result) return result.error;
    const { meeting } = result;

    if (meeting.status !== 'finished') {
      return NextResponse.json({ error: 'この例会は終了状態ではありません' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const scopeCondition = isDistrictScope(sessionUser.role)
      ? undefined
      : eq(meetings.clubId, sessionUser.clubId as string);

    await db
      .update(meetings)
      .set({
        status: 'closed',
        finishedAt: null,
        finishedBy: null,
        attendanceFinalized: false,
        updatedAt: now,
      } as any)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt), scopeCondition));

    return NextResponse.json({
      success: true,
      message: '例会の終了を取り消しました（締切状態に戻しました）',
    });
  } catch (e: any) {
    console.error('DELETE /api/meetings/[id]/finish error:', e);
    return NextResponse.json({ error: e?.message || '終了の取り消しに失敗しました' }, { status: 500 });
  }
}
