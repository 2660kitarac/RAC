/**
 * クラブ→地区への提出物 1件（クラブ役員用）
 *  PUT    … 編集・再提出
 *           報告書 { kind:'report', reportType, meetingId?, title, content, submit }（下書き・差し戻しのみ編集可）
 *           投稿   { kind:'instagram', postType, postUrl, meetingId?, caption }（審査待ち・差し戻しのみ。保存すると審査待ちに戻る）
 *  DELETE … ?kind=report（下書きのみ）/ ?kind=instagram（審査待ち・差し戻しのみ）。論理削除
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { clubReports, instagramPosts } from '@/lib/db/schema';
import { nowJst } from '@/lib/district/context';
import { getSubmitter, parsePostInput, parseReportInput } from '@/lib/district/submissions-server';

type Ctx = { params: Promise<{ id: string }> };

const CONFLICT = '状態が変わったため保存できませんでした。画面を読み込み直してください';

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const ctx = await getSubmitter();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return NextResponse.json({ error: '入力内容が正しくありません' }, { status: 400 });
    const now = nowJst();

    if (body.kind === 'report') {
      const [row] = await ctx.db
        .select({ id: clubReports.id, status: clubReports.status, districtId: clubReports.districtId })
        .from(clubReports)
        .where(and(eq(clubReports.id, id), eq(clubReports.clubId, ctx.club.id), isNull(clubReports.deletedAt)))
        .limit(1);
      if (!row) return NextResponse.json({ error: '報告書が見つかりません' }, { status: 404 });
      if (row.status !== 'draft' && row.status !== 'rejected') {
        return NextResponse.json({ error: '提出済み・承認済みの報告書は編集できません' }, { status: 409 });
      }
      const parsed = await parseReportInput(ctx, body);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const v = parsed.value;
      const districtId = row.districtId ?? ctx.districtId;
      if (v.submit && !districtId) {
        return NextResponse.json({ error: 'クラブの地区が設定されていないため提出できません' }, { status: 400 });
      }
      const updated = await ctx.db
        .update(clubReports)
        .set({
          districtId,
          meetingId: v.meetingId,
          title: v.title,
          reportType: v.reportType,
          content: v.content,
          updatedAt: now,
          // 提出するときは前回の差し戻し情報を消す。下書き保存なら差し戻し理由は残して見えるようにする
          ...(v.submit
            ? {
              status: 'submitted', submittedAt: now, submittedBy: ctx.user.id,
              rejectedAt: null, rejectionReason: null, approvedAt: null, reviewedBy: null,
            }
            : { status: 'draft' }),
        })
        .where(and(eq(clubReports.id, row.id), eq(clubReports.clubId, ctx.club.id), eq(clubReports.status, row.status)))
        .returning({ id: clubReports.id });
      if (updated.length === 0) return NextResponse.json({ error: CONFLICT }, { status: 409 });
      return NextResponse.json({ ok: true, id: row.id, status: v.submit ? 'submitted' : 'draft' });
    }

    if (body.kind === 'instagram') {
      const [row] = await ctx.db
        .select({ id: instagramPosts.id, status: instagramPosts.status })
        .from(instagramPosts)
        .where(and(eq(instagramPosts.id, id), eq(instagramPosts.clubId, ctx.club.id), isNull(instagramPosts.deletedAt)))
        .limit(1);
      if (!row) return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 });
      if (row.status !== 'pending' && row.status !== 'rejected') {
        return NextResponse.json({ error: '承認済みの投稿は編集できません' }, { status: 409 });
      }
      const parsed = await parsePostInput(ctx, body);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const v = parsed.value;
      const updated = await ctx.db
        .update(instagramPosts)
        .set({
          meetingId: v.meetingId,
          postType: v.postType,
          postUrl: v.postUrl,
          caption: v.caption || null,
          status: 'pending',
          score: 0,
          rejectionReason: null,
          reviewedBy: null,
          reviewedAt: null,
          submittedBy: ctx.user.id,
          submittedAt: now,
          updatedAt: now,
        })
        .where(and(eq(instagramPosts.id, row.id), eq(instagramPosts.clubId, ctx.club.id), eq(instagramPosts.status, row.status)))
        .returning({ id: instagramPosts.id });
      if (updated.length === 0) return NextResponse.json({ error: CONFLICT }, { status: 409 });
      return NextResponse.json({ ok: true, id: row.id, status: 'pending' });
    }

    return NextResponse.json({ error: '提出物の種類が正しくありません' }, { status: 400 });
  } catch (e) {
    console.error('PUT /api/club/district-submissions/[id] error:', e);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const ctx = await getSubmitter();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    const { id } = await params;
    const kind = request.nextUrl.searchParams.get('kind');
    const now = nowJst();

    if (kind === 'report') {
      const deleted = await ctx.db
        .update(clubReports)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(clubReports.id, id), eq(clubReports.clubId, ctx.club.id),
          eq(clubReports.status, 'draft'), isNull(clubReports.deletedAt),
        ))
        .returning({ id: clubReports.id });
      if (deleted.length === 0) {
        return NextResponse.json({ error: '削除できるのは下書きの報告書だけです' }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    if (kind === 'instagram') {
      const deleted = await ctx.db
        .update(instagramPosts)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(instagramPosts.id, id), eq(instagramPosts.clubId, ctx.club.id),
          inArray(instagramPosts.status, ['pending', 'rejected']), isNull(instagramPosts.deletedAt),
        ))
        .returning({ id: instagramPosts.id });
      if (deleted.length === 0) {
        return NextResponse.json({ error: '削除できるのは審査待ち・差し戻しの投稿だけです' }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: '提出物の種類が正しくありません' }, { status: 400 });
  } catch (e) {
    console.error('DELETE /api/club/district-submissions/[id] error:', e);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
