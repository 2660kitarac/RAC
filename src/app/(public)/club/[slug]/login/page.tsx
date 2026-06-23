'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LogIn, ArrowLeft } from 'lucide-react';

export default function ClubLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error('ログインに失敗しました', { description: 'メールアドレスまたはパスワードが正しくありません' });
        return;
      }

      router.push(`/club/${slug}/dashboard`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 flex flex-col">
      <div className="p-4">
        <Link href={`/club/${slug}`} className="inline-flex items-center gap-1 text-blue-200 text-sm hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> クラブページに戻る
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 shadow-lg">
              <span className="text-blue-600 font-bold text-2xl">R</span>
            </div>
            <h1 className="text-2xl font-bold text-white">メンバーログイン</h1>
            <p className="text-blue-200 text-sm mt-1">RAC Cloud</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="form-group">
                <Label htmlFor="email" required>メールアドレス</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="example@racclub.jp" autoComplete="email" required className="mt-1" />
              </div>
              <div className="form-group">
                <Label htmlFor="password" required>パスワード</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="パスワードを入力" autoComplete="current-password" required className="mt-1" />
              </div>
              <Button type="submit" loading={loading} className="w-full" size="lg">
                <LogIn className="h-4 w-4 mr-2" /> ログイン
              </Button>
            </form>

            <div className="mt-4 text-center space-y-2">
              <Link href="/reset-password" className="text-sm text-gray-500 hover:text-blue-600 block">
                パスワードを忘れた方はこちら
              </Link>
              <p className="text-xs text-gray-400">
                アカウントをお持ちでない方は{' '}
                <Link href="/register" className="text-blue-600 hover:underline font-medium">新規登録</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
