/**
 * Auth.js (NextAuth v5) 設定
 * - Credentials Provider（メール + パスワード）
 * - JWT セッション
 * - Supabase PostgreSQL の users テーブルで認証
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

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
          const bcrypt = await import('bcryptjs');
          const { db } = await import('@/lib/db');
          const { users } = await import('@/lib/db/schema');
          const { eq, and, isNull } = await import('drizzle-orm');

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
          if (!user.isActive) return null;

          if (user.status === 'pending') {
            throw new Error('PENDING_APPROVAL');
          }
          if (user.status === 'rejected') {
            throw new Error('ACCOUNT_REJECTED');
          }

          const isValid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          );

          if (!isValid) return null;

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
