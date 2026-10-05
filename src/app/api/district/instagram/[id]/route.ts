/**
 * Instagram 投稿の審査（地区役員用）
 *  PATCH body: { action: 'approve' | 'reject' | 'reopen' | 'score', score?: number, reason?: string }
 *   - approve（score 必須 0〜10）/ reject（reason 必須）は審査待ち（pending）のときだけ
 *   - reopen は承認済み／差し戻しを審査待ちに戻す（スコアは 0 に戻す）
 *   - score は承認済みの投稿のスコアだけ変更
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { instagramPosts } from '@/lib/db/schema';
import { nowJst, requireDistrictContext } from '@/lib/district/context';
import { LIMITS, SCORE_MAX, SCORE_MIN, cleanText, parseScore } from '@/lib/district/submissions';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.district) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown; score?: unknown } | null;
    const action = body?.action;
    if (action !== 'approve' && action !== 'reject' && action !== 'reopen' && action !== 'score') {
      return NextResponse.json({ error: '操作の指定が正しくありません' }, { status: 400 });
    }

    const [row] = await ctx.db
      .select({ id: instagramPosts.id, status: instagramPosts.status })
      .from(instagramPosts)
      .where(and(eq(instagramPosts.id, id), eq(instagramPosts.districtId, ctx.district.id), isNull(instagramPosts.deletedAt)))
      .limit(1);
    if (!row) return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 });

    const now = nowJst();
    const scoreError = `スコアは${SCORE_MIN}〜${SCORE_MAX}の整数で入力してください`;
    let patch: Partial<typeof instagramPosts.$inferInsert>;

    if (action === 'approve') {
      if (row.status !== 'pending') return NextResponse.json({ error: '審査待ちの投稿だけ承認できます' }, { status: 409 });
      const score = parseScore(body?.score);
      if (score === null) return NextResponse.json({ error: scoreError }, { status: 400 });
      patch = { status: 'approved', score, rejectionReason: null, reviewedBy: ctx.user.id, reviewedAt: now };
    } else if (action === 'reject') {
      if (row.status !== 'pending') return NextResponse.json({ error: '審査待ちの投稿だけ差し戻しできます' }, { status: 409 });
      const reason = cleanText(body?.reason);
      if (!reason) return NextResponse.json({ error: '差し戻しの理由を入力してください' }, { status: 400 });
      if (reason.length > LIMITS.reason) {
        return NextResponse.json({ error: `理由は${LIMITS.reason}文字以内で入力してください` }, { status: 400 });
      }
      patch = { status: 'rejected', score: 0, rejectionReason: reason, reviewedBy: ctx.user.id, reviewedAt: now };
    } else if (action === 'reopen') {
      if (row.status !== 'approved' && row.status !== 'rejected') {
        return NextResponse.json({ error: '承認済み・差し戻しの投稿だけ審査をやり直せます' }, { status: 409 });
      }
      patch = { status: 'pending', score: 0, rejectionReason: null, reviewedBy: null, reviewedAt: null };
    } else {
      if (row.status !== 'approved') return NextResponse.json({ error: '承認済みの投稿だけスコアを変更できます' }, { status: 409 });
      const score = parseScore(body?.score);
      if (score === null) return NextResponse.json({ error: scoreError }, { status: 400 });
      patch = { score, reviewedBy: ctx.user.id, reviewedAt: now };
    }

    const updated = await ctx.db
      .update(instagramPosts)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(instagramPosts.id, row.id), eq(instagramPosts.districtId, ctx.district.id), eq(instagramPosts.status, row.status)))
      .returning({ id: instagramPosts.id });
    if (updated.length === 0) {
      return NextResponse.json({ error: 'ほかの人が先に更新しました。画面を読み込み直してください' }, { status: 409 });
    }

    return NextResponse.json({ ok: true, status: patch.status ?? row.status, score: patch.score });
  } catch (e) {
    console.error('PATCH /api/district/instagram/[id] error:', e);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}
