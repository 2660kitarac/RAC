/**
 * 初期パスワードからの切り替え API
 *
 *   POST /api/profile/initial-password
 *   body: { newPassword: string }
 *
 * 旧初期パスワードのままログインした会員が、最初に自分のパスワードを設定するためのもの。
 * 現在のパスワードがまだ旧初期パスワードであることをサーバー側で確認できた場合だけ受け付ける
 * （通常のパスワード変更は /api/profile/password で、現在のパスワードの入力が必要）。
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq, and, isNull } from 'drizzle-orm';
import { auth, invalidateAccountCache } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { LEGACY_INITIAL_PASSWORD, validatePassword } from '@/lib/auth/password';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const newPassword = body?.newPassword;

    const validationError = validatePassword(newPassword);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    if (newPassword === LEGACY_INITIAL_PASSWORD) {
      return NextResponse.json({ error: '初期パスワードとは別のパスワードを設定してください' }, { status: 400 });
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

    // まだ初期パスワードのままであることを確認する（変更済みの人は通常の変更画面を使う）
    const stillInitial = await bcrypt.compare(LEGACY_INITIAL_PASSWORD, user.passwordHash || '');
    if (!stillInitial) {
      return NextResponse.json(
        { error: 'パスワードはすでに設定されています。変更は設定画面から行ってください' },
        { status: 400 },
      );
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date().toISOString() } as any)
      .where(and(eq(users.id, user.id), isNull(users.deletedAt)));

    invalidateAccountCache(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/profile/initial-password error:', error);
    return NextResponse.json({ error: 'パスワードの設定に失敗しました' }, { status: 500 });
  }
}
