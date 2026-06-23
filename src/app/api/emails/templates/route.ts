import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { emailTemplates } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// GET /api/emails/templates?clubId=xxx&templateType=custom
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    const clubId = url.searchParams.get('clubId') || session.user.clubId;
    const templateType = url.searchParams.get('templateType');

    const conditions = and(
      isNull(emailTemplates.deletedAt),
      clubId ? eq(emailTemplates.clubId, clubId) : undefined,
      templateType ? eq(emailTemplates.templateType, templateType) : undefined,
    );

    const results = await db.select().from(emailTemplates).where(conditions)
      .orderBy(emailTemplates.name);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/emails/templates error:', error);
    return NextResponse.json({ error: 'テンプレート一覧の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/emails/templates - テンプレート作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();
    const { clubId, districtId, name, templateType, subjectTemplate, bodyTemplate, isDefault } = body;

    if (!name || !subjectTemplate || !bodyTemplate) {
      return NextResponse.json({ error: 'name, subjectTemplate, bodyTemplate は必須です' }, { status: 400 });
    }

    const resolvedClubId = clubId || session.user.clubId;

    const id = randomUUID();
    await db.insert(emailTemplates).values({
      id,
      clubId: resolvedClubId || null,
      districtId: districtId || null,
      name,
      templateType: templateType || 'custom',
      subjectTemplate,
      bodyTemplate,
      isDefault: isDefault ?? false,
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/emails/templates error:', error);
    return NextResponse.json({ error: 'テンプレートの作成に失敗しました' }, { status: 500 });
  }
}
