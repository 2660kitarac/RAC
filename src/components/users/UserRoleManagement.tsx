'use client';

import { useState } from 'react';

import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { User, UserRole } from '@/types';
import { USER_ROLE_LABELS } from '@/types';
import { isClubAdmin } from '@/lib/hooks/useAuth';
import { Users, ShieldCheck, Pencil } from 'lucide-react';

interface UserRoleManagementProps {
  users: User[];
  currentUserId: string;
  clubId: string;
  userRole: UserRole;
}

const ROLE_COLORS: Record<string, string> = {
  system_owner: 'bg-red-100 text-red-700',
  district_admin: 'bg-orange-100 text-orange-700',
  district_representative: 'bg-amber-100 text-amber-700',
  district_secretary: 'bg-yellow-100 text-yellow-700',
  district_treasurer: 'bg-yellow-100 text-yellow-700',
  district_pr_chair: 'bg-yellow-100 text-yellow-700',
  zone_representative: 'bg-lime-100 text-lime-700',
  club_admin: 'bg-green-100 text-green-700',
  president: 'bg-emerald-100 text-emerald-700',
  secretary: 'bg-teal-100 text-teal-700',
  treasurer: 'bg-cyan-100 text-cyan-700',
  committee_chair: 'bg-blue-100 text-blue-700',
  member: 'bg-indigo-100 text-indigo-700',
  sponsor_rotarian: 'bg-purple-100 text-purple-700',
  external: 'bg-gray-100 text-gray-600',
};

// クラブ内で設定可能なロール
const CLUB_ROLES: UserRole[] = [
  'club_admin', 'president', 'secretary', 'treasurer',
  'committee_chair', 'member', 'sponsor_rotarian', 'external'
];

export default function UserRoleManagement({
  users: initialUsers,
  currentUserId,
  clubId,
  userRole,
}: UserRoleManagementProps) {
  const canManage = isClubAdmin(userRole);

  const [users, setUsers] = useState<User[]>(initialUsers);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    role: 'member' as UserRole,
    position: '',
  });

  const filtered = users.filter(u => {
    const nameMatch = search === '' || u.name.includes(search) || u.email.includes(search);
    const roleMatch = filterRole === 'all' || u.role === filterRole;
    return nameMatch && roleMatch;
  });

  const openEdit = (u: User) => {
    setEditTarget(u);
    setForm({ role: u.role, position: u.position ?? '' });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!editTarget) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/users/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: form.role,
          position: form.position || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '更新に失敗しました');

      setUsers(prev => prev.map(u =>
        u.id === editTarget.id
          ? { ...u, role: form.role, position: form.position || null }
          : u
      ));
      toast.success('権限を更新しました');
      setShowDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ロール別集計
  const roleSummary = CLUB_ROLES.reduce((acc, role) => {
    acc[role] = users.filter(u => u.role === role).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* 役職サマリー */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['president', 'secretary', 'treasurer', 'member'] as UserRole[]).map(role => (
          <Card key={role}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 font-medium">{USER_ROLE_LABELS[role]}</p>
              <p className="text-2xl font-bold text-gray-800">{roleSummary[role] ?? 0}名</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              ユーザー権限管理
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col gap-3 sm:flex-row mb-4">
            <Input placeholder="名前・メールで検索..." className="w-full sm:max-w-xs"
              value={search} onChange={e => setSearch(e.target.value)} />
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="役割で絞り込み" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての役割</SelectItem>
                {CLUB_ROLES.map(role => (
                  <SelectItem key={role} value={role}>{USER_ROLE_LABELS[role]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p>該当するユーザーが見つかりません</p>
            </div>
          ) : (
            <>
              {/* デスクトップ */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-gray-600">氏名</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">メールアドレス</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-600">役割</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">役職</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-600">状態</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">登録日</th>
                      {canManage && <th className="text-center py-2 px-3 font-medium text-gray-600">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(u => (
                      <tr key={u.id} className={`border-b hover:bg-gray-50 ${u.id === currentUserId ? 'bg-yellow-50/50' : ''}`}>
                        <td className="py-3 px-3">
                          <div className="font-medium flex items-center gap-1">
                            {u.name}
                            {u.id === currentUserId && (
                              <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">自分</span>
                            )}
                          </div>
                          {u.name_kana && <div className="text-xs text-gray-400">{u.name_kana}</div>}
                        </td>
                        <td className="py-3 px-3 text-gray-600">{u.email}</td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                            {USER_ROLE_LABELS[u.role]}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-gray-600 text-xs">{u.position ?? '—'}</td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {u.is_active ? '有効' : '無効'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-gray-500 text-xs">
                          {u.joined_date ? formatDate(u.joined_date) : '—'}
                        </td>
                        {canManage && (
                          <td className="py-3 px-3 text-center">
                            {u.id !== currentUserId && (
                              <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* モバイル */}
              <div className="sm:hidden space-y-3">
                {filtered.map(u => (
                  <div key={u.id} className={`border rounded-lg p-4 space-y-2 ${u.id === currentUserId ? 'border-yellow-200 bg-yellow-50/50' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">
                          {u.name}
                          {u.id === currentUserId && (
                            <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">自分</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {USER_ROLE_LABELS[u.role]}
                      </span>
                    </div>
                    {u.position && <p className="text-xs text-gray-500">役職: {u.position}</p>}
                    {canManage && u.id !== currentUserId && (
                      <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => openEdit(u)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />権限変更
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 権限編集ダイアログ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              権限の変更
            </DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-medium">{editTarget.name}</p>
                <p className="text-gray-500">{editTarget.email}</p>
                <p className="text-xs text-gray-400 mt-1">
                  現在の役割: {USER_ROLE_LABELS[editTarget.role]}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label required>新しい役割</Label>
                <Select value={form.role}
                  onValueChange={v => setForm(f => ({ ...f, role: v as UserRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLUB_ROLES.map(role => (
                      <SelectItem key={role} value={role}>{USER_ROLE_LABELS[role]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>役職・担当</Label>
                <Input placeholder="例：会長、幹事、広報委員長"
                  value={form.position}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                <p className="font-medium mb-1">⚠️ 権限変更の注意事項</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>会計（treasurer）以上はすべての収支情報を閲覧・編集できます</li>
                  <li>クラブ管理者（club_admin）はすべてのクラブ設定を変更できます</li>
                  <li>この変更はすぐに反映されます</li>
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSubmit} loading={loading}>
              権限を変更する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
