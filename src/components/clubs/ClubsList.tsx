'use client';

import { useState } from 'react';

import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { Club, Zone, UserRole } from '@/types';
import { isClubAdmin, isDistrictAdmin } from '@/lib/hooks/useAuth';
import { Building2, Plus, Pencil, Search, Trash2 } from 'lucide-react';

interface ClubsListProps {
  clubs: Club[];
  zones: Zone[];
  currentClubId: string;
  userRole: UserRole;
}

const CLUB_TYPE_LABELS: Record<string, string> = {
  RAC: 'ローターアクト',
  RC: 'ロータリー',
  OB_OG: 'OB・OG',
  GUEST: 'ゲスト',
  OTHER: 'その他',
};

const CLUB_TYPE_COLORS: Record<string, string> = {
  RAC: 'bg-blue-100 text-blue-700',
  RC: 'bg-indigo-100 text-indigo-700',
  OB_OG: 'bg-gray-100 text-gray-700',
  GUEST: 'bg-green-100 text-green-700',
  OTHER: 'bg-orange-100 text-orange-700',
};

export default function ClubsList({ clubs: initialClubs, zones, currentClubId, userRole }: ClubsListProps) {
  const canManage = isClubAdmin(userRole);
  const canDelete = isDistrictAdmin(userRole); // system_owner / district_admin のみ削除可

  const [clubs, setClubs] = useState<Club[]>(initialClubs);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Club | null>(null);
  const [loading, setLoading] = useState(false);

  // 削除確認ダイアログ
  const [deleteTarget, setDeleteTarget] = useState<Club | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [form, setForm] = useState({
    name: '', short_name: '', type: 'RAC', zone_id: '',
    district: '', area: '', email: '', phone: '', address: '',
    contact_name: '', memo: '', is_active: true,
  });

  const filtered = clubs.filter(c => {
    const nameMatch = search === '' || c.name.includes(search) || (c.short_name ?? '').includes(search);
    const typeMatch = filterType === 'all' || c.type === filterType;
    return nameMatch && typeMatch;
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: '', short_name: '', type: 'RAC', zone_id: '', district: '', area: '', email: '', phone: '', address: '', contact_name: '', memo: '', is_active: true });
    setShowDialog(true);
  };

  const openEdit = (club: Club) => {
    setEditTarget(club);
    setForm({
      name: club.name, short_name: club.short_name ?? '', type: club.type,
      zone_id: club.zone_id ?? '', district: club.district ?? '', area: club.area ?? '',
      email: club.email ?? '', phone: club.phone ?? '', address: club.address ?? '',
      contact_name: club.contact_name ?? '', memo: club.memo ?? '', is_active: club.is_active,
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('クラブ名を入力してください'); return; }
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        shortName: form.short_name || null,
        type: form.type,
        zoneId: form.zone_id || null,
        district: form.district || null,
        area: form.area || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        contactName: form.contact_name || null,
        memo: form.memo || null,
        isActive: form.is_active,
      };

      if (editTarget) {
        const res = await fetch(`/api/clubs/${editTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('更新失敗');
        setClubs(prev => prev.map(c =>
          c.id === editTarget.id
            ? { ...c, name: payload.name, short_name: payload.shortName, type: payload.type as Club['type'],
                district: payload.district, area: payload.area, email: payload.email,
                phone: payload.phone, address: payload.address, contact_name: payload.contactName,
                memo: payload.memo, is_active: payload.isActive }
            : c
        ));
        toast.success('クラブ情報を更新しました');
      } else {
        const res = await fetch('/api/clubs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '追加失敗');
        const newClub: Club = {
          id: data.id,
          name: payload.name,
          short_name: payload.shortName,
          type: payload.type as Club['type'],
          zone_id: payload.zoneId,
          district: payload.district,
          area: payload.area,
          email: payload.email,
          phone: payload.phone,
          address: payload.address,
          contact_name: payload.contactName,
          memo: payload.memo,
          is_active: payload.isActive,
        };
        setClubs(prev => [...prev, newClub]);
        toast.success('クラブを登録しました');
      }
      setShowDialog(false);
    } catch (err) {
      toast.error('保存に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/clubs/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '削除失敗');
      }
      setClubs(prev => prev.filter(c => c.id !== deleteTarget.id));
      toast.success(`「${deleteTarget.name}」を削除しました`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* サマリー */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['RAC', 'RC', 'OB_OG', 'OTHER'] as const).map(type => (
          <Card key={type} className="border">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 font-medium">{CLUB_TYPE_LABELS[type]}</p>
              <p className="text-2xl font-bold text-gray-800">
                {clubs.filter(c => c.type === type && c.is_active).length}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              クラブ・団体一覧
            </CardTitle>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />クラブ登録
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col gap-3 sm:flex-row mb-4">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input placeholder="クラブ名で検索..." className="pl-8"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="種別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての種別</SelectItem>
                <SelectItem value="RAC">ローターアクト</SelectItem>
                <SelectItem value="RC">ロータリー</SelectItem>
                <SelectItem value="OB_OG">OB・OG</SelectItem>
                <SelectItem value="OTHER">その他</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p>該当するクラブが見つかりません</p>
            </div>
          ) : (
            <>
              {/* デスクトップ */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-gray-600">クラブ名</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-600">種別</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">地区・エリア</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">連絡先</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-600">状態</th>
                      {canManage && <th className="text-center py-2 px-3 font-medium text-gray-600">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(club => (
                      <tr key={club.id} className={`border-b hover:bg-gray-50 ${club.id === currentClubId ? 'bg-blue-50/40' : ''}`}>
                        <td className="py-3 px-3">
                          <div className="font-medium text-gray-900">
                            {club.name}
                            {club.id === currentClubId && (
                              <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">自クラブ</span>
                            )}
                          </div>
                          {club.short_name && <div className="text-xs text-gray-400">{club.short_name}</div>}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLUB_TYPE_COLORS[club.type]}`}>
                            {CLUB_TYPE_LABELS[club.type]}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-gray-600 text-xs">
                          {[club.district, club.area].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="py-3 px-3 text-gray-600 text-xs">
                          {club.email || club.phone || '—'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${club.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {club.is_active ? '有効' : '無効'}
                          </span>
                        </td>
                        {canManage && (
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(club)} title="編集">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {canDelete && (
                                <Button
                                  size="sm" variant="ghost"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setDeleteTarget(club)}
                                  title="削除"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
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

              {/* モバイル */}
              <div className="sm:hidden space-y-3">
                {filtered.map(club => (
                  <div key={club.id} className={`border rounded-lg p-4 space-y-2 ${club.id === currentClubId ? 'border-blue-300 bg-blue-50/40' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {club.name}
                          {club.id === currentClubId && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">自クラブ</span>
                          )}
                        </p>
                        {club.short_name && <p className="text-xs text-gray-400">{club.short_name}</p>}
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLUB_TYPE_COLORS[club.type]}`}>
                        {CLUB_TYPE_LABELS[club.type]}
                      </span>
                    </div>
                    {(club.district || club.area) && (
                      <p className="text-xs text-gray-500">{[club.district, club.area].filter(Boolean).join(' / ')}</p>
                    )}
                    {club.email && <p className="text-xs text-gray-500">{club.email}</p>}
                    {canManage && (
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(club)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />編集
                        </Button>
                        {canDelete && (
                          <Button
                            size="sm" variant="outline"
                            className="flex-1 text-red-500 border-red-200 hover:bg-red-50"
                            onClick={() => setDeleteTarget(club)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />削除
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 登録・編集ダイアログ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'クラブ情報を編集' : '新規クラブ登録'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label required>クラブ名</Label>
                <Input placeholder="大阪北ローターアクトクラブ"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>略称</Label>
                <Input placeholder="大阪北RAC"
                  value={form.short_name} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label required>種別</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RAC">ローターアクト</SelectItem>
                    <SelectItem value="RC">ロータリー</SelectItem>
                    <SelectItem value="OB_OG">OB・OG</SelectItem>
                    <SelectItem value="OTHER">その他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {zones.length > 0 && (
                <div className="space-y-1.5 col-span-2">
                  <Label>ゾーン</Label>
                  <Select value={form.zone_id} onValueChange={v => setForm(f => ({ ...f, zone_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="ゾーンを選択..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— 未設定 —</SelectItem>
                      {zones.map(z => (
                        <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>地区</Label>
                <Input placeholder="第2660地区"
                  value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>エリア</Label>
                <Input placeholder="北大阪エリア"
                  value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>メールアドレス</Label>
                <Input type="email" placeholder="info@club.jp"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>電話番号</Label>
                <Input placeholder="06-0000-0000"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>住所</Label>
                <Input placeholder="大阪府大阪市..."
                  value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>担当者名</Label>
                <Input placeholder="山田 太郎"
                  value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>状態</Label>
                <Select value={form.is_active ? 'true' : 'false'}
                  onValueChange={v => setForm(f => ({ ...f, is_active: v === 'true' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">有効</SelectItem>
                    <SelectItem value="false">無効</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>メモ</Label>
                <Textarea placeholder="備考・メモ"
                  value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                  rows={3} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? '保存中...' : (editTarget ? '更新する' : '登録する')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              クラブを削除
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-700">
              以下のクラブを削除しますか？この操作は元に戻せません。
            </p>
            {deleteTarget && (
              <div className="bg-gray-50 rounded-lg p-3 border">
                <p className="font-medium text-gray-900">{deleteTarget.name}</p>
                {deleteTarget.short_name && (
                  <p className="text-xs text-gray-500">{deleteTarget.short_name}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">{CLUB_TYPE_LABELS[deleteTarget.type]}</p>
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
