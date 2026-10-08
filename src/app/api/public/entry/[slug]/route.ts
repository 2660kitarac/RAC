/**
 * 地区行事の申込（ログイン不要）
 *  GET  /api/public/entry/[slug] … フォーム設定と、選べるクラブの一覧
 *  POST /api/public/entry/[slug] … 申込を受け付け、修正用リンクを返す
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { eventRegistrations } from '@/lib/db/schema';
import { calcFees, isAccepting, validateInput } from '@/lib/event-registration/calc';
import {
  appBaseUrl, DUPLICATE_CLUB_MESSAGE, isDuplicateClubError, loadDistrictClubs, loadPublicForm, logAction, newEditToken, newId, publicConfig,
  registrationText, sanitizeInput, sendMail, summaryColumns,
} from '@/lib/event-registration/server';

/* ---- 送信元ごとの連続申込の制限（サーバーレスではインスタンス単位の簡易的な歯止め） ---- */
const CLIENT_LIMIT_MAX = 5;
const CLIENT_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const clientHits = new Map<string, number[]>();

function clientKey(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function isClientRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (clientHits.get(key) ?? []).filter(t => now - t < CLIENT_LIMIT_WINDOW_MS);
  if (hits.length >= CLIENT_LIMIT_MAX) {
    clientHits.set(key, hits);
    return true;
  }
  hits.push(now);
  clientHits.set(key, hits);
  if (clientHits.size > 1000) {
    for (const [k, v] of clientHits) if (!v.some(t => now - t < CLIENT_LIMIT_WINDOW_MS)) clientHits.delete(k);
  }
  return false;
}


type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const db = await getDbFromContext();
    const found = await loadPublicForm(db, slug);
    if (!found) return NextResponse.json({ error: '申込フォームが見つかりません' }, { status: 404 });
    const { districtName, clubs: clubList } = await loadDistrictClubs(db, found.form.districtId);
    return NextResponse.json({
      form: publicConfig(found.config),
      accepting: isAccepting(found.config),
      districtName,
      clubs: clubList,
    });
  } catch (e) {
    console.error('GET /api/public/entry/[slug] error:', e);
    return NextResponse.json({ error: '読み込みに失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const db = await getDbFromContext();
    const found = await loadPublicForm(db, slug);
    if (!found) return NextResponse.json({ error: '申込フォームが見つかりません' }, { status: 404 });
    const { form, config } = found;
    if (!isAccepting(config)) {
      return NextResponse.json({ error: '申込の受付は終了しました。地区役員にお問い合わせください' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: '内容が空です' }, { status: 400 });
    // ボット対策：画面には出さない入力欄に値が入っていたら受け付けない
    if (typeof body.website === 'string' && body.website.trim()) {
      return NextResponse.json({ error: '送信できませんでした' }, { status: 400 });
    }

    const input = sanitizeInput(body.input, config);
    // 地区内のクラブを選んだ場合は、そのクラブが本当にこの地区のものか確かめる
    if (input.clubId) {
      const { clubs: clubList, districtName } = await loadDistrictClubs(db, form.districtId);
      const club = clubList.find(c => c.id === input.clubId);
      if (!club) input.clubId = null;
      else {
        input.clubName = club.name;
        input.districtName = districtName;
      }
    }
    if (!input.clubId && !config.allowOtherDistricts) {
      return NextResponse.json({ error: '一覧からクラブを選んでください' }, { status: 400 });
    }
    // 同じクラブの二重申込を防ぐ（追加・変更は修正用リンクから）
    if (input.clubId) {
      const [dup] = await db
        .select({ id: eventRegistrations.id })
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.formId, form.id),
            eq(eventRegistrations.clubId, input.clubId),
            ne(eventRegistrations.status, 'cancelled'),
            isNull(eventRegistrations.deletedAt),
          ),
        )
        .limit(1);
      if (dup) {
        return NextResponse.json({ error: DUPLICATE_CLUB_MESSAGE }, { status: 409 });
      }
    }

    const errors = validateInput(config, input);
    if (errors.length > 0) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

    // 同じ送信元からの連続申込を制限する（他クラブの枠を埋める・メール送信の悪用を防ぐ）
    if (isClientRateLimited(`${form.id}:${clientKey(request)}`)) {
      return NextResponse.json({ error: '短時間に申込が続いています。しばらくおいてから再度お試しください' }, { status: 429 });
    }

    // いたずら・連続送信の歯止め（1フォームあたり10分間に30件まで）
    const [recent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.formId, form.id),
          sql`${eventRegistrations.submittedAt} > ((now() - interval '10 minutes') AT TIME ZONE 'Asia/Tokyo')::text`,
        ),
      );
    if ((recent?.n ?? 0) >= 30) {
      return NextResponse.json({ error: '申込が集中しています。数分おいてから再度お試しください' }, { status: 429 });
    }

    const id = newId();
    const token = newEditToken();
    await db.insert(eventRegistrations).values({
      id,
      formId: form.id,
      editToken: token,
      districtName: input.districtName || null,
      clubId: input.clubId,
      clubName: input.clubName,
      registrantName: input.registrantName,
      registrantEmail: input.registrantEmail,
      registrantPhone: input.registrantPhone || null,
      data: input,
      ...summaryColumns(config, input),
    });
    await logAction(db, { formId: form.id, registrationId: id, action: 'created', actor: input.registrantName, detail: `${input.clubName} ${input.attendees.length}名` });

    const editUrl = `${appBaseUrl(request)}/entry/${form.slug}/edit/${token}`;
    const text = registrationText(config, input);
    const mailed = await sendMail(
      input.registrantEmail,
      `【申込受付】${config.title}`,
      `${input.registrantName} 様\n\n${config.title} のお申込みを受け付けました。\n\n${text}\n\n▼ 内容の確認・修正（締切まで）\n${editUrl}\n\n${config.contact ? `【お問い合わせ】\n${config.contact}\n` : ''}`,
    );
    if (config.notifyEmail) {
      await sendMail(config.notifyEmail, `【新規申込】${config.title}／${input.clubName}`, text);
    }

    return NextResponse.json({ id, editPath: `/entry/${form.slug}/edit/${token}`, fees: calcFees(config, input), mailed });
  } catch (e) {
    if (isDuplicateClubError(e)) return NextResponse.json({ error: DUPLICATE_CLUB_MESSAGE }, { status: 409 });
    console.error('POST /api/public/entry/[slug] error:', e);
    return NextResponse.json({ error: '申込の送信に失敗しました。時間をおいて再度お試しください' }, { status: 500 });
  }
}
