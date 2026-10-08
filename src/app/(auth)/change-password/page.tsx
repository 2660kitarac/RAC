/**
 * 初回パスワード設定ページ
 * - 旧初期パスワードのままログインした会員がリダイレクトされる
 * - 新しいパスワードを設定するまで、ほかの画面には進めない
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import ChangePasswordForm from './ChangePasswordForm';

export const metadata = { title: 'パスワードの設定 | RAC Cloud' };

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  // 設定が必要ない人はダッシュボードへ
  if (!session.user.mustChangePassword) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-3 shadow-lg">
            <span className="text-white font-bold text-2xl">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">RAC Cloud</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">パスワードを設定してください</h2>
          <p className="text-sm text-gray-500 mb-6">
            {session.user.name} さんのアカウントは初期パスワードのままです。
            安全のため、ご自身のパスワードを設定してからご利用ください。
          </p>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
