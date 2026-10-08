import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

/**
 * クラブ会員ページ共通のレイアウト
 * 初期パスワードのままログインした会員は、先にパスワードを設定してもらう。
 */
export default async function ClubPortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user?.mustChangePassword) redirect('/change-password');
  return <>{children}</>;
}
