/**
 * 本人によるパスワード変更 API
 *
 *   PATCH /api/profile/password
 *   body: { currentPassword: string, newPassword: string }
 *
 * 会員（クラブ会員）自身が自分のパスワードを変更する。
 * 現在のパスワードの照合を必須とする。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/auth/password';

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;

    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
      return NextResponse.json({ error: '現在のパスワードを入力してください' }, { status: 400 });
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: '現在のパスワードと同じものは使用できません' },
        { status: 400 }
      );
    }

    const db = await getDbFromContext();

    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash || '');
    if (!isValid) {
      return NextResponse.json(
        { error: '現在のパスワードが正しくありません' },
        { status: 400 }
      );
    }

    const newHash = await bcrypt.hash(newPassword as string, 10);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({
      success: true,
      message: 'パスワードを変更しました',
    });
  } catch (e: any) {
    console.error('PATCH /api/profile/password error:', e);
    return NextResponse.json(
      { error: 'パスワードの変更に失敗しました' },
      { status: 500 }
    );
  }
}
