import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { emailTemplates } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canManageClub, isDistrictScope } from '@/lib/auth/tenant';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * email_templates.club_id は NULL 可（全クラブ共通テンプレート）。
 *  - club_id が NULL のテンプレートは地区スタッフのみ操作可
 *  - それ以外は自クラブのものだけ操作可
 */
function canTouchTemplate(
  user: { role?: string | null; clubId?: string | null },
  templateClubId: string | null | undefined,
): boolean {
  if (isDistrictScope(user?.role)) return true;
  if (!templateClubId) return false; // 共通テンプレートはクラブ側から触らせない
  return !!user?.clubId && user.clubId === templateClubId;
}

/** clubId による多重防御条件（地区スタッフはクラブ横断可） */
function clubGuard(user: { role?: string | null; clubId?: string | null }) {
  if (isDistrictScope(user?.role)) return undefined;
  return user?.clubId ? eq(emailTemplates.clubId, user.clubId) : undefined;
}

async function loadTemplate(db: any, id: string) {
  const rows = await db
    .select({ id: emailTemplates.id, clubId: emailTemplates.clubId })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

// GET /api/emails/templates/[id]
export async function GET(_: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();

    const result = await db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deletedAt)))
      .limit(1);

    if (!result.length) return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 });

    const clubId = (result[0] as any).clubId as string | null;
    // 参照は「共通テンプレート」または「自クラブのもの」まで許可
    if (!isDistrictScope(session.user.role) && clubId && clubId !== session.user.clubId) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('GET /api/emails/templates/[id] error:', error);
    return NextResponse.json({ error: 'テンプレートの取得に失敗しました' }, { status: 500 });
  }
}

// PATCH /api/emails/templates/[id]
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!canManageClub(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getDbFromContext();

    const tpl = await loadTemplate(db, id);
    if (!tpl) return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 });
    if (!canTouchTemplate(session.user, tpl.clubId)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const allowedFields = ['name', 'templateType', 'subjectTemplate', 'bodyTemplate', 'isDefault'];
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    await db.update(emailTemplates)
      .set(updateData as any)
      .where(and(eq(emailTemplates.id, id), clubGuard(session.user)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/emails/templates/[id] error:', error);
    return NextResponse.json({ error: 'テンプレートの更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/emails/templates/[id] - 論理削除
export async function DELETE(_: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!canManageClub(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getDbFromContext();

    const tpl = await loadTemplate(db, id);
    if (!tpl) return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 });
    if (!canTouchTemplate(session.user, tpl.clubId)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    await db.update(emailTemplates)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(emailTemplates.id, id), clubGuard(session.user)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/emails/templates/[id] error:', error);
    return NextResponse.json({ error: 'テンプレートの削除に失敗しました' }, { status: 500 });
  }
}
