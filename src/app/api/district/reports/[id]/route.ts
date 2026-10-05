/**
 * クラブ報告書の審査（地区役員用）
 *  PATCH body: { action: 'approve' | 'reject' | 'reopen', reason?: string }
 *   - approve / reject は「審査待ち（submitted）」のときだけ
 *   - reopen は「承認済み／差し戻し」を審査待ちに戻す
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { clubReports } from '@/lib/db/schema';
import { nowJst, requireDistrictContext } from '@/lib/district/context';
import { LIMITS, cleanText } from '@/lib/district/submissions';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.district) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown } | null;
    const action = body?.action;
    if (action !== 'approve' && action !== 'reject' && action !== 'reopen') {
      return NextResponse.json({ error: '操作の指定が正しくありません' }, { status: 400 });
    }

    const [row] = await ctx.db
      .select({ id: clubReports.id, status: clubReports.status })
      .from(clubReports)
      .where(and(eq(clubReports.id, id), eq(clubReports.districtId, ctx.district.id), isNull(clubReports.deletedAt)))
      .limit(1);
    if (!row) return NextResponse.json({ error: '報告書が見つかりません' }, { status: 404 });

    const now = nowJst();
    let patch: Partial<typeof clubReports.$inferInsert>;
    if (action === 'approve') {
      if (row.status !== 'submitted') return NextResponse.json({ error: '審査待ちの報告書だけ承認できます' }, { status: 409 });
      patch = { status: 'approved', approvedAt: now, rejectedAt: null, rejectionReason: null, reviewedBy: ctx.user.id };
    } else if (action === 'reject') {
      if (row.status !== 'submitted') return NextResponse.json({ error: '審査待ちの報告書だけ差し戻しできます' }, { status: 409 });
      const reason = cleanText(body?.reason);
      if (!reason) return NextResponse.json({ error: '差し戻しの理由を入力してください' }, { status: 400 });
      if (reason.length > LIMITS.reason) {
        return NextResponse.json({ error: `理由は${LIMITS.reason}文字以内で入力してください` }, { status: 400 });
      }
      patch = { status: 'rejected', rejectedAt: now, approvedAt: null, rejectionReason: reason, reviewedBy: ctx.user.id };
    } else {
      if (row.status !== 'approved' && row.status !== 'rejected') {
        return NextResponse.json({ error: '承認済み・差し戻しの報告書だけ審査をやり直せます' }, { status: 409 });
      }
      // 審査待ちに戻す（過去の差し戻し理由は消す）
      patch = { status: 'submitted', approvedAt: null, rejectedAt: null, rejectionReason: null, reviewedBy: null };
    }

    const updated = await ctx.db
      .update(clubReports)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(clubReports.id, row.id), eq(clubReports.districtId, ctx.district.id), eq(clubReports.status, row.status)))
      .returning({ id: clubReports.id });
    if (updated.length === 0) {
      return NextResponse.json({ error: 'ほかの人が先に更新しました。画面を読み込み直してください' }, { status: 409 });
    }

    return NextResponse.json({ ok: true, status: patch.status });
  } catch (e) {
    console.error('PATCH /api/district/reports/[id] error:', e);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}
