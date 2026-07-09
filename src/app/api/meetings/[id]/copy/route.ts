import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings } from '@/lib/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();

    const [orig] = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .limit(1);

    if (!orig) return NextResponse.json({ error: '例会が見つかりません' }, { status: 404 });

    const newId = randomUUID();
    const now = new Date().toISOString();

    await db.insert(meetings).values({
      ...orig,
      id: newId,
      title: orig.title + '（コピー）',
      // 日程・締切・MU URLはクリア（編集画面で設定してもらう）
      date: '',
      registrationDeadline: null,
      muRegistrationSlug: null,
      muRegistrationUrl: null,
      status: 'draft',
      createdBy: session.user.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    return NextResponse.json({ id: newId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
