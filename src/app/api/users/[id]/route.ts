import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// PATCH /api/users/[id] - ロール・プロフィール更新
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const body = await request.json();

    // 自分自身 or 管理者のみ更新可能
    const isAdmin = ['system_owner', 'district_admin', 'admin'].includes(session.user.role || '');
    // クラブ管理者（role変更・status承認権限あり、自クラブのみ）
    const isClubAdmin = ['club_admin', 'president', 'club_account'].includes(session.user.role || '');
    const isSelf = session.user.id === params.id;
    if (!isAdmin && !isClubAdmin && !isSelf) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    // 一般ユーザーが変更できるフィールド
    const selfAllowedFields = ['name', 'nameKana', 'phone', 'position', 'birthDate', 'addressZip', 'address', 'occupation', 'allergy', 'dietaryNote', 'emergencyContactName', 'emergencyContactPhone', 'memo'];
    // クラブ管理者が変更できるフィールド（role, position, status）
    const clubAdminFields = ['role', 'position', 'status'];
    // 上位管理者のみ変更できるフィールド
    const adminOnlyFields = ['memberType', 'isActive', 'joinedAt', 'resignedAt', 'clubId', 'status'];

    for (const field of selfAllowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    if (isClubAdmin || isAdmin) {
      for (const field of clubAdminFields) {
        if (field in body) updateData[field] = body[field];
      }
    }

    if (isAdmin) {
      for (const field of adminOnlyFields) {
        if (field in body) updateData[field] = body[field];
      }
    }

    // パスワード変更（本人のみ or 管理者）
    if (body.password && (isSelf || isAdmin)) {
      updateData.passwordHash = await bcrypt.hash(body.password, 10);
    }

    await db.update(users).set(updateData as any).where(eq(users.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/users/[id] error:', error);
    return NextResponse.json({ error: 'ユーザー情報の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/users/[id] - 論理削除（管理者のみ）
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!['system_owner', 'admin', 'district_admin'].includes(session.user.role || '')) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const db = getDbFromContext();
    await db.update(users)
      .set({ deletedAt: new Date().toISOString(), isActive: false })
      .where(eq(users.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/users/[id] error:', error);
    return NextResponse.json({ error: 'ユーザーの削除に失敗しました' }, { status: 500 });
  }
}
