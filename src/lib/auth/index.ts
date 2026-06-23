/**
 * Auth.js (NextAuth v5) 設定
 *
 * - Credentials Provider（メール + パスワード）
 * - JWT セッション
 * - Cloudflare D1 上の users テーブルで認証
 *
 * 設計上の注意:
 * - trustHost: true を明示（Cloudflare Workers 環境では CF_PAGES が未設定のため自動 trustHost にならない）
 * - bcryptjs と D1 は authorize() 内で動的 import を使用して遅延ロードする
 *   → モジュール初期化時のエラーを回避（lib/auth が layout.tsx などでも import されるため）
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

// ============================================================
// NextAuth 設定
// ============================================================
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30日
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.clubId = (user as any).clubId;
        token.status = (user as any).status;  // 承認状態
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
        (session.user as any).clubId = token.clubId;
        (session.user as any).status = token.status;  // 承認状態
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },

      /**
       * D1 に直接アクセスして認証する。
       * bcryptjs と drizzle-orm は動的 import で遅延ロードし、
       * モジュール初期化時（layout.tsx などでの import 時）のエラーを回避する。
       */
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // 動的 import で bcryptjs を遅延ロード
          const bcrypt = await import('bcryptjs');

          // getDbFromContext も動的 import
          const { getDbFromContext } = await import('@/lib/db/get-db-from-context');
          const { users } = await import('@/lib/db/schema');
          const { eq, and, isNull } = await import('drizzle-orm');

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
              status: users.status,  // 承認状態を取得
            })
            .from(users)
            .where(and(eq(users.email, credentials.email as string), isNull(users.deletedAt)))
            .limit(1);

          if (!user) {
            console.log('[Auth] User not found:', credentials.email);
            return null;
          }

          if (!user.isActive) {
            console.log('[Auth] User inactive:', credentials.email);
            return null;
          }

          // pending ユーザーはログイン不可
          if (user.status === 'pending') {
            console.log('[Auth] User pending (not yet approved):', credentials.email);
            // エラーを throw してCredentialsSignin扱いにする
            throw new Error('PENDING_APPROVAL');
          }

          // rejected ユーザーもログイン不可
          if (user.status === 'rejected') {
            console.log('[Auth] User rejected:', credentials.email);
            throw new Error('ACCOUNT_REJECTED');
          }

          const isValid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          );

          if (!isValid) {
            console.log('[Auth] Password mismatch:', credentials.email);
            return null;
          }

          console.log('[Auth] Login success:', credentials.email);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            clubId: user.clubId,
            status: user.status,
          };
        } catch (e: any) {
          // PENDING_APPROVAL / ACCOUNT_REJECTED はそのまま再 throw
          if (e?.message === 'PENDING_APPROVAL' || e?.message === 'ACCOUNT_REJECTED') {
            throw e;
          }
          console.error('[Auth] authorize error:', e);
          return null;
        }
      },
    }),
  ],
});

// ============================================================
// 型拡張
// ============================================================
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      clubId: string | null;
      status: string;  // 'pending' | 'active' | 'rejected'
    };
  }
}
