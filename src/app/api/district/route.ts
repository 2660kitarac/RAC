import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { districtEvents, users } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireDistrictContext, resolveDistrict } from '@/lib/district/context';
import { parseEventInput } from '@/lib/district/event-input';

// GET /api/district - 自分の地区の行事一覧（ログインユーザーなら誰でも可）
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const [me] = await db
      .select({ districtId: users.districtId, clubId: users.clubId })
      .from(users)
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
      .limit(1);
    const district = me ? await resolveDistrict(db, me) : null;
    if (!district) return NextResponse.json({ events: [] });

    const events = await db
      .select()
      .from(districtEvents)
      .where(and(eq(districtEvents.districtId, district.id), isNull(districtEvents.deletedAt)))
      .orderBy(desc(districtEvents.date));
    return NextResponse.json({ events });
  } catch (error) {
    console.error('GET /api/district error:', error);
    return NextResponse.json({ error: '地区行事の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/district - 地区行事作成（地区役員のみ。地区は本人の担当地区に固定）
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.district) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });

    const body = await request.json().catch(() => null);
    const parsed = await parseEventInput(ctx.db, ctx.district.id, body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const id = nanoid();
    await ctx.db.insert(districtEvents).values({
      id,
      districtId: ctx.district.id,
      ...parsed.values,
      createdBy: ctx.user.id,
    });
    return NextResponse.json({ id, success: true });
  } catch (error) {
    console.error('POST /api/district error:', error);
    return NextResponse.json({ error: '地区行事の作成に失敗しました' }, { status: 500 });
  }
}
