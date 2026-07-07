'use client';

import { useState } from 'react';
import { Plus, Building2, Key, Eye, EyeOff, CheckCircle, Trash2, X, Copy, LogIn, ExternalLink, List } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Club {
  id: string;
  name: string;
  shortName: string | null;
  slug: string | null;
}

interface ClubAccount {
  id: string;
  name: string;
  email: string;
  clubId: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ClubAccountsContentProps {
  clubs: Club[];
  clubAccounts: ClubAccount[];
}

// パスワード変更モーダル
function ChangePasswordModal({
  account,
  clubName,
  onClose,
  onSuccess,
}: {
  account: ClubAccount;
  clubName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!newPassword) { toast.error('新しいパスワードを入力してください'); return; }
    if (newPassword.length < 8) { toast.error('パスワードは8文字以上にしてください'); return; }
    if (newPassword !== confirmPassword) { toast.error('パスワードが一致しません'); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/users/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'パスワードの変更に失敗しました');
        return;
      }
      toast.success(`「${clubName}」のパスワードを変更しました`);
      onSuccess();
      onClose();
    } catch {
      toast.error('パスワードの変更に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* モーダル本体 */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-blue-500" />
            <h2 className="text-base font-semibold text-gray-900">パスワード変更</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 対象アカウント情報 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
          <p className="font-medium text-blue-800">変更対象</p>
          <p className="text-blue-700 mt-0.5">クラブ: {clubName}</p>
          <p className="text-blue-600 text-xs mt-0.5">メール: {account.email}</p>
        </div>

        {/* 新しいパスワード */}
        <div>
          <Label htmlFor="newPassword">新しいパスワード（8文字以上） <span className="text-red-500">*</span></Label>
          <div className="relative mt-1">
            <Input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="新しいパスワードを入力"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* 確認用パスワード */}
        <div>
          <Label htmlFor="confirmNewPassword">パスワード（確認） <span className="text-red-500">*</span></Label>
          <Input
            id="confirmNewPassword"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="パスワードを再入力"
            className="mt-1"
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          />
        </div>

        {/* パスワード強度インジケーター */}
        {newPassword.length > 0 && (
          <div className="space-y-1">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(level => (
                <div
                  key={level}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    newPassword.length >= level * 3
                      ? newPassword.length >= 12 ? 'bg-green-500'
                        : newPassword.length >= 8 ? 'bg-amber-400'
                        : 'bg-red-400'
                      : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-gray-400">
              {newPassword.length < 8 ? '⚠️ 8文字以上にしてください'
                : newPassword.length < 12 ? '普通のパスワード'
                : '✓ 強いパスワード'}
            </p>
          </div>
        )}

        {/* ボタン */}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            キャンセル
          </Button>
          <Button onClick={handleSubmit} loading={loading} className="flex-1">
            <CheckCircle className="h-4 w-4 mr-1" />
            変更する
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ClubAccountsContent({ clubs, clubAccounts: initialAccounts }: ClubAccountsContentProps) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accounts, setAccounts] = useState<ClubAccount[]>(initialAccounts);

  // パスワード変更モーダル
  const [changePasswordTarget, setChangePasswordTarget] = useState<ClubAccount | null>(null);

  // フォーム状態
  const [clubId, setClubId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const selectedClub = clubs.find(c => c.id === clubId);

  const handleCreate = async () => {
    if (!clubId) { toast.error('クラブを選択してください'); return; }
    if (!email) { toast.error('メールアドレスを入力してください'); return; }
    if (!password) { toast.error('パスワードを入力してください'); return; }
    if (password.length < 8) { toast.error('パスワードは8文字以上にしてください'); return; }
    if (password !== confirmPassword) { toast.error('パスワードが一致しません'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/club-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name: selectedClub?.name || 'クラブアカウント',
          clubId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'クラブアカウントの作成に失敗しました');
        return;
      }

      toast.success(`「${selectedClub?.name}」のクラブアカウントを作成しました`);
      setAccounts(prev => [...prev, {
        id: data.id,
        name: selectedClub?.name || 'クラブアカウント',
        email,
        clubId,
        isActive: true,
        createdAt: new Date().toISOString(),
      }]);

      // フォームリセット
      setClubId('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setShowForm(false);
    } catch {
      toast.error('クラブアカウントの作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (accountId: string, accountName: string) => {
    if (!confirm(`「${accountName}」のクラブアカウントを削除しますか？\nこの操作は取り消せません。`)) return;
    try {
      const res = await fetch(`/api/users/${accountId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('クラブアカウントを削除しました');
      setAccounts(prev => prev.filter(a => a.id !== accountId));
    } catch {
      toast.error('削除に失敗しました');
    }
  };

  const getClubName = (cId: string | null) => clubs.find(c => c.id === cId)?.name || '-';
  const getClub = (cId: string | null) => clubs.find(c => c.id === cId);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label}をコピーしました`);
  };

  // ログインURL生成
  const getLoginUrl = (club: Club) => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    if (club.slug) return `${base}/club/${club.slug}/login`;
    return `${base}/login`;
  };

  return (
    <div className="space-y-6">
      {/* パスワード変更モーダル */}
      {changePasswordTarget && (
        <ChangePasswordModal
          account={changePasswordTarget}
          clubName={getClubName(changePasswordTarget.clubId)}
          onClose={() => setChangePasswordTarget(null)}
          onSuccess={() => {}}
        />
      )}

      {/* ページヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">クラブアカウント管理</h1>
          <p className="text-gray-500 text-sm mt-1">
            各クラブのログインアカウントを作成・管理します
          </p>
        </div>
        <Button onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4 mr-1" />
          新規作成
        </Button>
      </div>

      {/* 説明バナー */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Key className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800 text-sm">クラブアカウントとは</p>
            <p className="text-blue-600 text-xs mt-1">
              クラブ単位でシステムにログインするためのアカウントです。
              ここで設定したメールアドレスとパスワードをクラブに共有してください。
              クラブアカウントは新規会員の承認・却下、例会管理などの操作が行えます。
            </p>
          </div>
        </div>
      </div>

      {/* 新規作成フォーム */}
      {showForm && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              新規クラブアカウント作成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="clubSelect">対象クラブ <span className="text-red-500">*</span></Label>
              <Select onValueChange={setClubId} value={clubId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="クラブを選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {clubs.map(club => (
                    <SelectItem key={club.id} value={club.id}>
                      {club.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="accountEmail">ログイン用メールアドレス <span className="text-red-500">*</span></Label>
              <Input
                id="accountEmail"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="club@example.com"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="accountPassword">パスワード（8文字以上） <span className="text-red-500">*</span></Label>
              <div className="relative mt-1">
                <Input
                  id="accountPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="パスワードを入力"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="accountConfirmPassword">パスワード（確認） <span className="text-red-500">*</span></Label>
              <Input
                id="accountConfirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="パスワードを再入力"
                className="mt-1"
              />
            </div>

            {selectedClub && email && password && (
              <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-gray-700 mb-1">作成内容の確認</p>
                <p className="text-gray-600">クラブ: {selectedClub.name}</p>
                <p className="text-gray-600">メール: {email}</p>
                <p className="text-gray-400 text-xs mt-1">
                  ※ このメールとパスワードをクラブ担当者に安全な方法で共有してください
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                キャンセル
              </Button>
              <Button onClick={handleCreate} loading={loading} className="flex-1">
                <CheckCircle className="h-4 w-4 mr-1" />
                作成する
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ログイン情報一覧 */}
      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <List className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-base">
              ログイン情報一覧
              <span className="text-gray-400 font-normal text-sm ml-2">（{accounts.length}件）</span>
            </CardTitle>
          </div>
          <p className="text-xs text-gray-500 mt-1">各クラブに共有するログイン情報です。コピーボタンで素早くコピーできます。</p>
        </CardHeader>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">アカウントがまだ作成されていません</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">クラブ名</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">メールアドレス</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">ログインURL</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">状態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {accounts.map(account => {
                    const club = getClub(account.clubId);
                    const loginUrl = club ? getLoginUrl(club) : '';
                    return (
                      <tr key={account.id} className="hover:bg-gray-50 transition-colors">
                        {/* クラブ名 */}
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{getClubName(account.clubId)}</span>
                        </td>
                        {/* メールアドレス */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <code className="text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                              {account.email}
                            </code>
                            <button
                              onClick={() => copyText(account.email, 'メールアドレス')}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="コピー"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        {/* ログインURL */}
                        <td className="px-4 py-3">
                          {loginUrl ? (
                            <div className="flex items-center gap-1.5">
                              <code className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded max-w-[200px] truncate block">
                                {loginUrl}
                              </code>
                              <button
                                onClick={() => copyText(loginUrl, 'ログインURL')}
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors flex-shrink-0"
                                title="URLをコピー"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <a
                                href={loginUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors flex-shrink-0"
                                title="URLを開く"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">slug未設定</span>
                          )}
                        </td>
                        {/* 状態 */}
                        <td className="px-4 py-3">
                          <Badge className={account.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                            {account.isActive ? '有効' : '無効'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 既存アカウント一覧 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            クラブアカウント一覧
            <span className="text-gray-400 font-normal text-sm ml-2">（{accounts.length}件）</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">クラブアカウントがありません</p>
              <p className="text-gray-400 text-xs mt-1">「新規作成」から各クラブのアカウントを作成してください</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {accounts.map(account => (
                <div key={account.id} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* アカウント情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{getClubName(account.clubId)}</p>
                        <Badge className={account.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                          {account.isActive ? '有効' : '無効'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{account.email}</p>
                    </div>

                    {/* 操作ボタン */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* パスワード変更ボタン */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => setChangePasswordTarget(account)}
                      >
                        <Key className="h-4 w-4 mr-1" />
                        PW変更
                      </Button>
                      {/* 削除ボタン */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(account.id, getClubName(account.clubId))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
