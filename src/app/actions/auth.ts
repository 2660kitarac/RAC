'use server';

/**
 * 認証 Server Actions（Auth.js v5 版）
 *
 * bcryptjs は registerUser() 内で動的 import する（トップレベル import でモジュール初期化エラーが発生するため）
 */

import { signIn as authSignIn, signOut as authSignOut } from '@/lib/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

// ============================================================
// signIn
// ============================================================
export async function signIn(email: string, password: string) {
  try {
    await authSignIn('credentials', {
      email,
      password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'メールアドレスまたはパスワードが間違っています' };
        default:
          return { error: '認証エラーが発生しました' };
      }
    }
    if (isRedirectError(error)) throw error;
    return { error: 'サーバーエラーが発生しました' };
  }

  // redirect() はクライアント側で行うため、成功を返すだけ
  return { success: true };
}

// ============================================================
// signOut
// ============================================================
export async function signOut() {
  await authSignOut({ redirectTo: '/login' });
}

// ============================================================
// registerUser（新規会員登録 Server Action）
// ============================================================
// ※ bcryptjs・DB関連は全て動的 import（トップレベル static import 禁止）

interface RegisterInput {
  email: string;
  password: string;
  name: string;
  nameKana?: string;
  phone: string;
  clubId?: string;
  birthDate?: string;
  addressZip?: string;
  address?: string;
  occupation?: string;
  allergy?: string;
  dietaryNote?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export async function registerUser(input: RegisterInput) {
  try {
    // 全て動的 import で遅延ロード
    const bcrypt = await import('bcryptjs');
    const { getDbFromContext } = await import('@/lib/db/get-db-from-context');
    const { users } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    const { nanoid } = await import('@/lib/utils');

    const db = getDbFromContext();

    // メール重複チェック
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (existing.length > 0) {
      return { error: 'このメールアドレスはすでに登録されています' };
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(input.password, 12);

    // ユーザー作成
    const userId = nanoid();
    await db.insert(users).values({
      id: userId,
      email: input.email,
      passwordHash,
      name: input.name,
      nameKana: input.nameKana || null,
      phone: input.phone || null,
      clubId: input.clubId || null,
      birthDate: input.birthDate || null,
      addressZip: input.addressZip || null,
      address: input.address || null,
      occupation: input.occupation || null,
      allergy: input.allergy || null,
      dietaryNote: input.dietaryNote || null,
      emergencyContactName: input.emergencyContactName || null,
      emergencyContactPhone: input.emergencyContactPhone || null,
      role: 'member',
      memberType: 'RAC',
      isActive: true,
      status: 'pending',  // 承認フロー: クラブが承認するまで pending
    });

    return { success: true, userId };
  } catch (error) {
    // 詳細エラーログ（本番 Worker ログに出力される）
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : '';
    console.error('[registerUser] エラー発生:', errMsg);
    console.error('[registerUser] スタック:', errStack);
    return { error: '登録に失敗しました。しばらくしてから再度お試しください。', _debug: errMsg };
  }
}
