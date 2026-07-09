'use client';

import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import type { User, Club } from '@/types';
import { USER_ROLE_LABELS } from '@/types';
import { isClubAdmin } from '@/lib/hooks/useAuth';
import { User as UserIcon, Building2, Lock } from 'lucide-react';

interface SettingsPageProps {
  profile: User;
  club: Club | null | undefined;
}

export default function SettingsPage({ profile, club }: SettingsPageProps) {
  const canManageClub = isClubAdmin(profile.role);

  // プロフィールフォーム
  const [profileForm, setProfileForm] = useState({
    name: profile.name ?? '',
    name_kana: profile.name_kana ?? '',
    phone: profile.phone ?? '',
    position: profile.position ?? '',
    memo: profile.memo ?? '',
  });
  const [profileLoading, setProfileLoading] = useState(false);

  // クラブ設定フォーム
  const [clubForm, setClubForm] = useState({
    name: club?.name ?? '',
    short_name: club?.short_name ?? '',
    email: club?.email ?? '',
    phone: club?.phone ?? '',
    address: club?.address ?? '',
    contact_name: club?.contact_name ?? '',
    memo: club?.memo ?? '',
    muFeePersonalBurden: (club as any)?.muFeePersonalBurden ?? false,
  });
  const [clubLoading, setClubLoading] = useState(false);

  // パスワード変更フォーム
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);

  // プロフィール保存
  const handleProfileSave = async () => {
    if (!profileForm.name.trim()) { toast.error('氏名は必須です'); return; }
    setProfileLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'profile', ...profileForm }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success('プロフィールを更新しました');
    } catch {
      toast.error('更新に失敗しました');
    } finally {
      setProfileLoading(false);
    }
  };

  // クラブ設定保存
  const handleClubSave = async () => {
    if (!club || !clubForm.name.trim()) { toast.error('クラブ名は必須です'); return; }
    setClubLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'club', clubId: club.id, ...clubForm }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success('クラブ設定を更新しました');
    } catch {
      toast.error('更新に失敗しました');
    } finally {
      setClubLoading(false);
    }
  };

  // パスワード変更
  const handlePasswordChange = async () => {
    if (!pwForm.next) { toast.error('新しいパスワードを入力してください'); return; }
    if (pwForm.next.length < 8) { toast.error('パスワードは8文字以上にしてください'); return; }
    if (pwForm.next !== pwForm.confirm) { toast.error('パスワードが一致しません'); return; }
    setPwLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'password', currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success('パスワードを変更しました');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      toast.error(err.message ?? 'パスワード変更に失敗しました');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <Tabs defaultValue="profile">
      <TabsList className="mb-6">
        <TabsTrigger value="profile" className="flex items-center gap-1.5">
          <UserIcon className="h-3.5 w-3.5" />プロフィール
        </TabsTrigger>
        {canManageClub && (
          <TabsTrigger value="club" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />クラブ設定
          </TabsTrigger>
        )}
        <TabsTrigger value="security" className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" />セキュリティ
        </TabsTrigger>
      </TabsList>

      {/* プロフィールタブ */}
      <TabsContent value="profile">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">プロフィール情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 変更不可情報 */}
            <div className="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">メールアドレス</span>
                <span className="font-medium">{profile.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">所属クラブ</span>
                <span className="font-medium">{club?.name ?? '未設定'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">役割</span>
                <span className="font-medium">{USER_ROLE_LABELS[profile.role]}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label required>氏名</Label>
                <Input value={profileForm.name}
                  onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>氏名（カナ）</Label>
                <Input placeholder="ヤマダ タロウ"
                  value={profileForm.name_kana}
                  onChange={e => setProfileForm(f => ({ ...f, name_kana: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>電話番号</Label>
                <Input type="tel" placeholder="090-0000-0000"
                  value={profileForm.phone}
                  onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>役職・担当</Label>
                <Input placeholder="例：広報委員長"
                  value={profileForm.position}
                  onChange={e => setProfileForm(f => ({ ...f, position: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>メモ</Label>
                <Textarea placeholder="備考"
                  value={profileForm.memo}
                  onChange={e => setProfileForm(f => ({ ...f, memo: e.target.value }))}
                  rows={3} />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleProfileSave} disabled={profileLoading}>
                {profileLoading ? '保存中...' : '変更を保存'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* クラブ設定タブ */}
      {canManageClub && (
        <TabsContent value="club">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">クラブ基本設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label required>クラブ名</Label>
                  <Input value={clubForm.name}
                    onChange={e => setClubForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>略称</Label>
                  <Input placeholder="大阪北RAC"
                    value={clubForm.short_name}
                    onChange={e => setClubForm(f => ({ ...f, short_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>問い合わせ担当者名</Label>
                  <Input placeholder="山田 太郎"
                    value={clubForm.contact_name}
                    onChange={e => setClubForm(f => ({ ...f, contact_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>メールアドレス</Label>
                  <Input type="email"
                    value={clubForm.email}
                    onChange={e => setClubForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>電話番号</Label>
                  <Input value={clubForm.phone}
                    onChange={e => setClubForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>住所</Label>
                  <Input placeholder="大阪府大阪市..."
                    value={clubForm.address}
                    onChange={e => setClubForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>クラブメモ</Label>
                  <Textarea value={clubForm.memo}
                    onChange={e => setClubForm(f => ({ ...f, memo: e.target.value }))}
                    rows={3} />
                </div>
              </div>

              {/* MU費負担方式 */}
              <div className="border rounded-lg p-4 bg-orange-50">
                <h3 className="text-sm font-semibold text-gray-800 mb-1">MU費負担方式</h3>
                <p className="text-xs text-gray-500 mb-3">
                  会員が他クラブにMU訪問した際のMU費の負担方式を設定します。
                </p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clubForm.muFeePersonalBurden}
                    onChange={e => setClubForm(f => ({ ...f, muFeePersonalBurden: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">MU費を個人負担にする</p>
                    <p className="text-xs text-gray-500">
                      OFFの場合: クラブ負担（会計に自動計上・後日精算）<br />
                      ONの場合: 個人負担（会計不計上・訪問回数のみ管理）
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleClubSave} disabled={clubLoading}>
                  {clubLoading ? '保存中...' : 'クラブ設定を保存'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {/* セキュリティタブ */}
      <TabsContent value="security">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">パスワード変更</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-sm">
            <div className="space-y-1.5">
              <Label required>新しいパスワード</Label>
              <Input type="password" placeholder="8文字以上"
                value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label required>新しいパスワード（確認）</Label>
              <Input type="password" placeholder="同じパスワードを入力"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handlePasswordChange} disabled={pwLoading}>
                {pwLoading ? '変更中...' : 'パスワードを変更'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
