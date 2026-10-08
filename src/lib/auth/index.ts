/**
 * Auth.js (NextAuth v5) 設定
 * - Credentials Provider（メール + パスワード）
 * - JWT セッション
 * - Supabase PostgreSQL の users テーブルで認証
 *
 * パフォーマンス対応 (fixes #1):
 *   - bcryptjs の dynamic import をトップレベルに移動（コールドスタート遅延を排除）
 *   - db / schema / drizzle-orm も同様にトップレベル import
 *   ※ bcryptjs はピュアJS実装でイベントループをブロックするため、
 *     cost係数は 10 に設定して 1件あたりの処理時間を抑える（~86ms）
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

/** ログイン中のアカウント状態（ロール・有効/無効）をDBと照合する間隔 */
const SESSION_RECHECK_MS = 5 * 60 * 1000;

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
        token.status = (user as any).status;
        token.name = user.name;
        token.email = user.email;
        token.checkedAt = Date.now();
        return token;
      }

      // ログイン中のアカウント状態を定期的にDBと照合する。
      // JWT は30日有効なため、照合しないと無効化・削除・ロール変更が次回ログインまで反映されない。
      const checkedAt = typeof token.checkedAt === 'number' ? token.checkedAt : 0;
      if (token.id && Date.now() - checkedAt > SESSION_RECHECK_MS) {
        try {
          const [current] = await db
            .select({
              role: users.role,
              clubId: users.clubId,
              status: users.status,
              isActive: users.isActive,
              name: users.name,
              email: users.email,
            })
            .from(users)
            .where(and(eq(users.id, token.id as string), isNull(users.deletedAt)))
            .limit(1);

          // 削除・無効化・却下されたアカウントはセッションを破棄する
          if (!current || !current.isActive || current.status === 'rejected') return null;

          token.role = current.role;
          token.clubId = current.clubId;
          token.status = current.status;
          token.name = current.name;
          token.email = current.email;
          token.checkedAt = Date.now();
        } catch (e) {
          // DB 障害時はログアウトさせず、次回に再照合する
          console.error('[Auth] session recheck error:', e);
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
        (session.user as any).clubId = token.clubId;
        (session.user as any).status = token.status;
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

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const [user] = await db
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              passwordHash: users.passwordHash,
              role: users.role,
              clubId: users.clubId,
              isActive: users.isActive,
              status: users.status,
            })
            .from(users)
            .where(and(eq(users.email, credentials.email as string), isNull(users.deletedAt)))
            .limit(1);

          if (!user) return null;

          // 先にパスワードを照合する（パスワードを知らない人に「承認待ち」などの状態を見せない）
          const isValid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          );
          if (!isValid) return null;

          if (!user.isActive) return null;

          if (user.status === 'pending') {
            throw new Error('PENDING_APPROVAL');
          }
          if (user.status === 'rejected') {
            throw new Error('ACCOUNT_REJECTED');
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            clubId: user.clubId,
            status: user.status,
          };
        } catch (e: any) {
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

// 型拡張
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      clubId: string | null;
      status: string;
    };
  }
}
