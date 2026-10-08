'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ChangePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('確認用のパスワードが一致しません');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profile/initial-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'パスワードの設定に失敗しました');
      // ログイン情報（cookie）を最新の状態に書き換える。
      // 画面の描画中は cookie を更新できないため、ここで更新しないと照合が毎回走り続ける
      await fetch('/api/auth/session', { cache: 'no-store' }).catch(() => {});
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスワードの設定に失敗しました');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="new-password">新しいパスワード</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="h-11 text-base"
          required
        />
        <p className="text-xs text-gray-500">8文字以上で、英字と数字をそれぞれ1文字以上含めてください</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">新しいパスワード（確認）</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          className="h-11 text-base"
          required
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}
      <Button type="submit" className="w-full h-11 text-base" disabled={saving}>
        {saving ? '設定しています…' : 'パスワードを設定する'}
      </Button>
    </form>
  );
}
