import { NextResponse } from 'next/server';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

// GET /api/clubs/public - 認証不要のクラブ一覧（登録フォーム・MU登録で使用）
export async function GET() {
  try {
    const db = getDbFromContext();

    const results = await db
      .select({
        id: clubs.id,
        name: clubs.name,
        shortName: clubs.shortName,
        type: clubs.type,
      })
      .from(clubs)
      .where(and(eq(clubs.isActive, true), isNull(clubs.deletedAt)))
      .orderBy(clubs.name);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/clubs/public error:', error);
    return NextResponse.json({ error: 'クラブ一覧の取得に失敗しました' }, { status: 500 });
  }
}
