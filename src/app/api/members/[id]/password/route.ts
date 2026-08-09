/**
 * クラブアカウントによる会員パスワード再設定 API（代理リセット）
 *
 *   POST /api/members/[id]/password
 *   body:
 *     { newPassword: string }   … 指定したパスワードに設定
 *     { generate: true }        … 仮パスワードを自動生成して返す
 *
 * 権限:
 *  - クラブアカウント / クラブ管理者 … 自クラブ会員のみ
 *  - 地区スタッフ（system_owner 等） … 全会員
 *  - 上位ロール（system_owner / district_admin）のパスワードは
 *    クラブ側からは変更不可（権限昇格の防止）
 *
 * 本人による変更は現在のパスワード照合が必要なため
 * /api/profile/password を使用する（本APIは代理リセット専用）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import {
  canResetPasswordFor,
  validatePassword,
  generateTemporaryPassword,
} from '@/lib/auth/password';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const { id } = await params;
    const db = await getDbFromContext();
    const actor = session.user as { id?: string; role?: string; clubId?: string | null };

    // ---- 対象会員を取得 ----
    const [target] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        clubId: users.clubId,
      })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: '会員が見つかりません' }, { status: 404 });
    }

    // ---- 権限検証（自クラブ限定・上位ロール保護） ----
    const permission = canResetPasswordFor(actor, target);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || '権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    // ---- パスワードを決定（指定 or 自動生成） ----
    let newPassword: string;
    let generated = false;

    if (body?.generate === true) {
      newPassword = generateTemporaryPassword(10);
      generated = true;
    } else {
      const validationError = validatePassword(body?.newPassword);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
      newPassword = body.newPassword as string;
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)));

    return NextResponse.json({
      success: true,
      message: `${target.name} さんのパスワードを再設定しました`,
      member: { id: target.id, name: target.name, email: target.email },
      // 自動生成時のみ平文を返す（管理者が本人に伝えるため）
      temporaryPassword: generated ? newPassword : undefined,
    });
  } catch (e: any) {
    console.error('POST /api/members/[id]/password error:', e);
    return NextResponse.json(
      { error: 'パスワードの再設定に失敗しました' },
      { status: 500 }
    );
  }
}
