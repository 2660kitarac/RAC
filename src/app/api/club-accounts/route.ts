/**
 * POST /api/club-accounts
 * system_owner が club_account ロールのユーザーを作成する API
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    // system_owner / district_admin のみ作成可能
    if (!['system_owner', 'district_admin'].includes(session.user.role || '')) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, name, clubId } = body;

    if (!email || !password || !name || !clubId) {
      return NextResponse.json({ error: 'メール・パスワード・名前・クラブIDは必須です' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'パスワードは8文字以上にしてください' }, { status: 400 });
    }

    const bcrypt = await import('bcryptjs');
    const { nanoid } = await import('@/lib/utils');
    const db = await getDbFromContext();

    // メール重複チェック
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: 'このメールアドレスはすでに登録されています' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = nanoid();

    await db.insert(users).values({
      id: userId,
      email,
      passwordHash,
      name,
      clubId,
      role: 'club_account',
      memberType: 'RAC',
      isActive: true,
      status: 'active',  // クラブアカウントは即時有効
    });

    return NextResponse.json({ success: true, id: userId });
  } catch (error) {
    console.error('POST /api/club-accounts error:', error);
    return NextResponse.json({ error: 'クラブアカウントの作成に失敗しました' }, { status: 500 });
  }
}
