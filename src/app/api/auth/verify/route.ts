import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '入力が不正です' }, { status: 400 });
    }

    const db = getDbFromContext();

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        role: users.role,
        clubId: users.clubId,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'アカウントが無効です' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password as string, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'パスワードが正しくありません' }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clubId: user.clubId,
    });
  } catch (error) {
    console.error('Auth verify error:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
