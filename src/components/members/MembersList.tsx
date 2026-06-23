'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  Plus, Search, Download, Edit, UserX, UserCheck, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, exportToCSV } from '@/lib/utils';
import type { User, UserRole, Club } from '@/types';
import { MEMBER_TYPE_LABELS, USER_ROLE_LABELS } from '@/types';
import { isClubAdmin, isDistrictAdmin } from '@/lib/hooks/useAuth';
import { Pagination } from '@/components/ui/pagination';

interface PaginationInfo {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

interface MembersListProps {
  members: User[];
  clubs: Pick<Club, 'id' | 'name' | 'short_name'>[];
  currentUserClubId: string | null;
  userRole: UserRole;
  pagination?: PaginationInfo;
  filters?: { search?: string; status?: string };
}

export default function MembersList({ members: initialMembers, clubs, currentUserClubId, userRole, pagination, filters }: MembersListProps) {
  const [members, setMembers] = useState(initialMembers);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editMember, setEditMember] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const canManage = isClubAdmin(userRole);
  const canDelete = isDistrictAdmin(userRole); // system_owner / district_admin のみ削除可

  // 削除確認ダイアログ
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [form, setForm] = useState({
    name: '', name_kana: '', email: '', phone: '',
    role: 'member', member_type: 'RAC', position: '',
    joined_date: '', is_active: true, memo: '', club_id: currentUserClubId || '',
  });

  const filtered = members.filter(m => {
    const matchType = typeFilter === 'all' || m.member_type === typeFilter;
    return matchType;
  });

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const search = form.get('search') as string;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    params.set('page', '1');
    router.push(`/members?${params.toString()}`);
  };

  const openCreate = () => {
    setEditMember(null);
    setForm({ name: '', name_kana: '', email: '', phone: '', role: 'member', member_type: 'RAC', position: '', joined_date: '', is_active: true, memo: '', club_id: currentUserClubId });
    setShowDialog(true);
  };

  const openEdit = (member: User) => {
    setEditMember(member);
    setForm({
      name: member.name,
      name_kana: member.name_kana || '',
      email: member.email,
      phone: member.phone || '',
      role: member.role,
      member_type: member.member_type,
      position: member.position || '',
      joined_date: member.joined_date || '',
      is_active: member.is_active,
      memo: member.memo || '',
      club_id: member.club_id || currentUserClubId,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) {
      toast.error('氏名とメールアドレスは必須です');
      return;
    }
    setLoading(true);
    try {
      if (editMember) {
        const res = await fetch(`/api/members/${editMember.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name, nameKana: form.name_kana || null,
            phone: form.phone || null, role: form.role, memberType: form.member_type,
            position: form.position || null, joinedAt: form.joined_date || null,
            isActive: form.is_active, memo: form.memo || null,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        setMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, ...form } as User : m));
        toast.success('会員情報を更新しました');
      } else {
        const res = await fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clubId: form.club_id, name: form.name, nameKana: form.name_kana || null,
            email: form.email, phone: form.phone || null, role: form.role,
            memberType: form.member_type, position: form.position || null,
            joinedAt: form.joined_date || null, memo: form.memo || null,
          }),
        });
        const newData = await res.json();
        if (!res.ok) throw new Error(newData.error);
        setMembers(prev => [...prev, { ...form, id: newData.id, is_active: true } as unknown as User]);
        toast.success('会員を追加しました');
      }
      setShowDialog(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '保存に失敗しました';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (member: User) => {
    const res = await fetch(`/api/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !member.is_active }),
    });
    if (res.ok) {
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active: !m.is_active } : m));
      toast.success(member.is_active ? '無効にしました' : '有効にしました');
    } else {
      toast.error('更新に失敗しました');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/members/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '削除失敗');
      }
      setMembers(prev => prev.filter(m => m.id !== deleteTarget.id));
      toast.success(`「${deleteTarget.name}」を削除しました`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setDeleteLoading(false);
    }
  };

  const exportCSV = () => {
    const data = filtered.map(m => ({
      '氏名': m.name, 'ふりがな': m.name_kana || '',
      'メールアドレス': m.email, '電話番号': m.phone || '',
      '区分': MEMBER_TYPE_LABELS[m.member_type], '役職': m.position || '',
      'ロール': USER_ROLE_LABELS[m.role], '入会日': m.joined_date || '',
      '在籍': m.is_active ? '在籍' : '退会', '備考': m.memo || '',
    }));
    exportToCSV(data, '会員一覧');
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">会員管理</h1>
          <p className="text-gray-500 text-sm mt-1">
            {pagination ? `全${pagination.totalCount}名` : `${members.length}名`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              会員を追加
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                name="search"
                placeholder="名前、メールで検索..."
                defaultValue={filters?.search || ''}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">検索</Button>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-36">
                <SelectValue placeholder="区分" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {Object.entries(MEMBER_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters?.status || 'active'}
              onValueChange={v => {
                const params = new URLSearchParams();
                params.set('status', v);
                params.set('page', '1');
                if (filters?.search) params.set('search', filters.search);
                router.push(`/members?${params.toString()}`);
              }}
            >
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="在籍状況" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="active">在籍</SelectItem>
                <SelectItem value="inactive">退会</SelectItem>
              </SelectContent>
            </Select>
          </form>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p className="text-gray-500">会員が見つかりません</p>
        </div>
      ) : (
        <>
          {pagination && pagination.totalPages > 1 && (
            <Pagination {...pagination} className="border border-gray-200 rounded-lg bg-white px-4" />
          )}
          {/* デスクトップ */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">氏名</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">メール</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">区分</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">役職</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">入会日</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
                      {canManage && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(member => (
                      <tr key={member.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{member.name}</p>
                            {member.name_kana && <p className="text-xs text-gray-400">{member.name_kana}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{member.email}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{MEMBER_TYPE_LABELS[member.member_type]}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{member.position || '-'}</td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {member.joined_date ? formatDate(member.joined_date) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={member.is_active ? 'success' : 'secondary'}>
                            {member.is_active ? '在籍' : '退会'}
                          </Badge>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon-sm" onClick={() => openEdit(member)} title="編集">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => toggleActive(member)}
                                className={member.is_active ? 'text-amber-500 hover:text-amber-700' : 'text-green-500 hover:text-green-700'}
                                title={member.is_active ? '無効にする' : '有効にする'}
                              >
                                {member.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                              </Button>
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setDeleteTarget(member)}
                                  title="削除"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* モバイル */}
          <div className="md:hidden space-y-3">
            {filtered.map(member => (
              <Card key={member.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">{member.name}</p>
                      <p className="text-xs text-gray-500">{member.email}</p>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant="secondary" className="text-xs">{MEMBER_TYPE_LABELS[member.member_type]}</Badge>
                      <Badge variant={member.is_active ? 'success' : 'secondary'} className="text-xs">
                        {member.is_active ? '在籍' : '退会'}
                      </Badge>
                    </div>
                  </div>
                  {member.position && <p className="text-sm text-gray-600 mt-1">役職: {member.position}</p>}
                  {canManage && (
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(member)}>
                        <Edit className="h-3 w-3 mr-1" /> 編集
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className={`flex-1 ${member.is_active ? 'text-amber-600 border-amber-200' : 'text-green-600 border-green-200'}`}
                        onClick={() => toggleActive(member)}
                      >
                        {member.is_active ? <><UserX className="h-3 w-3 mr-1" />無効</> : <><UserCheck className="h-3 w-3 mr-1" />有効</>}
                      </Button>
                      {canDelete && (
                        <Button
                          variant="outline" size="sm"
                          className="text-red-500 border-red-200 hover:bg-red-50"
                          onClick={() => setDeleteTarget(member)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          {pagination && pagination.totalPages > 1 && (
            <Pagination {...pagination} className="border border-gray-200 rounded-lg bg-white px-4" />
          )}
        </>
      )}

      {/* 追加・編集ダイアログ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editMember ? '会員情報を編集' : '会員を追加'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label required>氏名</Label>
                <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="山田 太郎" className="mt-1" />
              </div>
              <div className="form-group">
                <Label>ふりがな</Label>
                <Input value={form.name_kana} onChange={e => setForm({...form, name_kana: e.target.value})} placeholder="やまだ たろう" className="mt-1" />
              </div>
            </div>
            <div className="form-group">
              <Label required>メールアドレス</Label>
              <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} disabled={!!editMember} className="mt-1" />
            </div>
            <div className="form-group">
              <Label>電話番号</Label>
              <Input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>区分</Label>
                <Select value={form.member_type} onValueChange={v => setForm({...form, member_type: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MEMBER_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="form-group">
                <Label>ロール</Label>
                <Select value={form.role} onValueChange={v => setForm({...form, role: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(USER_ROLE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>役職</Label>
                <Input value={form.position} onChange={e => setForm({...form, position: e.target.value})} placeholder="会長" className="mt-1" />
              </div>
              <div className="form-group">
                <Label>入会日</Label>
                <Input type="date" value={form.joined_date} onChange={e => setForm({...form, joined_date: e.target.value})} className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSave} loading={loading}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              会員を削除
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-700">
              以下の会員を削除しますか？この操作は元に戻せません。
            </p>
            {deleteTarget && (
              <div className="bg-gray-50 rounded-lg p-3 border">
                <p className="font-medium text-gray-900">{deleteTarget.name}</p>
                {deleteTarget.name_kana && (
                  <p className="text-xs text-gray-500">{deleteTarget.name_kana}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">{deleteTarget.email}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLoading ? '削除中...' : '削除する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
