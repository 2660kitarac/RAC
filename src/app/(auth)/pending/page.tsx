/**
 * 承認待ちページ
 * - status='pending' のユーザーがログイン後にリダイレクトされるページ
 * - クラブアカウントが承認するまでダッシュボードにアクセスできない
 */

import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Clock, CheckCircle, Mail, LogOut } from 'lucide-react';

export const metadata = { title: '承認待ち | RAC Cloud' };

export default async function PendingPage() {
  const session = await auth();

  // 未ログインなら /login へ
  if (!session?.user) redirect('/login');

  // 承認済みならダッシュボードへ
  if ((session.user as any).status === 'active') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* ロゴ */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-3 shadow-lg">
            <span className="text-white font-bold text-2xl">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">RAC Cloud</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-5">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center">
              <Clock className="h-10 w-10 text-amber-500" />
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
            クラブの承認をお待ちください
          </h2>
          <p className="text-gray-500 text-sm text-center mb-6">
            {session.user.name} さんの登録申請を受け付けました。
            <br />
            クラブアカウントが承認すると、ログインできるようになります。
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800">登録完了</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {session.user.email} で登録されました
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <Clock className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">承認待ち</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  クラブアカウントによる承認をお待ちください
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Mail className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">承認後の手順</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  承認されると、登録したメールアドレスとパスワードでログインできます
                </p>
              </div>
            </div>
          </div>

          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
