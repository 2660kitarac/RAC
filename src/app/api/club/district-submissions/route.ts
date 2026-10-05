/**
 * クラブ→地区への提出（クラブ役員用）
 *  GET  … 自クラブの報告書・Instagram 投稿・例会の選択肢
 *         ?meetingReport=<meetingId> のときは例会報告書の本文 { title, content } を返す
 *  POST … 新規作成 { kind:'report', reportType, meetingId?, title, content, submit } / { kind:'instagram', postType, postUrl, meetingId?, caption }
 */
import { NextRequest, NextResponse } from 'next/server';
import { clubReports, instagramPosts } from '@/lib/db/schema';
import { nowJst } from '@/lib/district/context';
import { getSubmitter, loadClubSubmissions, loadMeetingReport, parsePostInput, parseReportInput } from '@/lib/district/submissions-server';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSubmitter();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const meetingId = request.nextUrl.searchParams.get('meetingReport');
    if (meetingId) {
      const r = await loadMeetingReport(ctx, meetingId);
      if (!r) return NextResponse.json({ error: 'この例会の報告書はまだ作成されていません' }, { status: 404 });
      return NextResponse.json(r);
    }
    return NextResponse.json(await loadClubSubmissions(ctx));
  } catch (e) {
    console.error('GET /api/club/district-submissions error:', e);
    return NextResponse.json({ error: '読み込みに失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSubmitter();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.districtId) {
      return NextResponse.json({ error: 'クラブの地区が設定されていないため提出できません。管理者に連絡してください' }, { status: 400 });
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return NextResponse.json({ error: '入力内容が正しくありません' }, { status: 400 });

    const now = nowJst();
    const id = crypto.randomUUID();

    if (body.kind === 'report') {
      const parsed = await parseReportInput(ctx, body);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const v = parsed.value;
      await ctx.db.insert(clubReports).values({
        id,
        districtId: ctx.districtId,
        clubId: ctx.club.id,
        meetingId: v.meetingId,
        title: v.title,
        reportType: v.reportType,
        content: v.content,
        status: v.submit ? 'submitted' : 'draft',
        submittedAt: v.submit ? now : null,
        submittedBy: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, id, status: v.submit ? 'submitted' : 'draft' });
    }

    if (body.kind === 'instagram') {
      const parsed = await parsePostInput(ctx, body);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const v = parsed.value;
      await ctx.db.insert(instagramPosts).values({
        id,
        districtId: ctx.districtId,
        clubId: ctx.club.id,
        meetingId: v.meetingId,
        postType: v.postType,
        postUrl: v.postUrl,
        caption: v.caption || null,
        status: 'pending',
        score: 0,
        submittedBy: ctx.user.id,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, id, status: 'pending' });
    }

    return NextResponse.json({ error: '提出物の種類が正しくありません' }, { status: 400 });
  } catch (e) {
    console.error('POST /api/club/district-submissions error:', e);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}
