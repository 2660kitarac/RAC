'use client';

import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { UserRole } from '@/types';
import { canManageAwards } from '@/lib/hooks/useAuth';
import { Award, Plus, Pencil, Trash2 } from 'lucide-react';

interface ScoreItem {
  id: string; code: string; name: string;
  max_score: number | null; calculation_type: string; description: string | null;
}
interface AwardSetting {
  id: string; fiscal_year: number; award_period_start: string;
  award_period_end: string; description: string | null;
}

interface AwardsSettingsProps {
  scoreItems: ScoreItem[];
  awardSetting: AwardSetting | null;
  districtId: string;
  currentYear: number;
  userRole: UserRole;
}

const CALC_TYPES = [
  { value: 'manual', label: '手動入力' },
  { value: 'attendance_rate', label: '出席率' },
  { value: 'makeup_count', label: 'MU回数' },
  { value: 'instagram_posts', label: 'Instagram投稿数' },
  { value: 'report_submission', label: '報告書提出' },
  { value: 'new_members', label: '新入会員数' },
  { value: 'event_attendance', label: '地区行事参加' },
  { value: 'custom', label: 'カスタム計算' },
];

export default function AwardsSettings({
  scoreItems: initialItems, awardSetting,
  districtId, currentYear, userRole,
}: AwardsSettingsProps) {
  const canManage = canManageAwards(userRole);

  const [items, setItems] = useState<ScoreItem[]>(initialItems);
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<ScoreItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: '', name: '', max_score: '', calculation_type: 'manual', description: '',
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm({ code: '', name: '', max_score: '', calculation_type: 'manual', description: '' });
    setShowDialog(true);
  };

  const openEdit = (item: ScoreItem) => {
    setEditTarget(item);
    setForm({ code: item.code, name: item.name, max_score: String(item.max_score ?? ''), calculation_type: item.calculation_type, description: item.description ?? '' });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast.error('コードと項目名は必須です'); return; }
    setLoading(true);
    try {
      const payload = {
        districtId,
        fiscalYear: currentYear,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        maxScore: form.max_score ? Number(form.max_score) : null,
        calculationType: form.calculation_type,
        description: form.description || null,
      };

      if (editTarget) {
        const response = await fetch(`/api/awards/items/${editTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '更新に失敗しました');
        setItems(prev => prev.map(i => i.id === editTarget.id ? {
          ...i,
          code: payload.code,
          name: payload.name,
          max_score: payload.maxScore,
          calculation_type: payload.calculationType,
          description: payload.description,
        } : i));
        toast.success('表彰項目を更新しました');
      } else {
        const response = await fetch('/api/awards/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '追加に失敗しました');
        setItems(prev => [...prev, {
          id: data.id || crypto.randomUUID(),
          code: payload.code,
          name: payload.name,
          max_score: payload.maxScore,
          calculation_type: payload.calculationType,
          description: payload.description,
        }]);
        toast.success('表彰項目を追加しました');
      }
      setShowDialog(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '保存に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/awards/items/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '削除に失敗しました');
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success('表彰項目を削除しました');
      setDeleteConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 表彰期間設定 */}
      {awardSetting && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-blue-800">表彰対象期間</p>
            <p className="text-sm text-blue-600 mt-1">
              {awardSetting.award_period_start} 〜 {awardSetting.award_period_end}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 表彰項目一覧 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4" />
              表彰点数項目（{items.length}項目）
            </CardTitle>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />項目追加
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Award className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p>表彰項目が設定されていません</p>
              {canManage && (
                <Button size="sm" variant="outline" className="mt-4" onClick={openCreate}>
                  最初の項目を追加する
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">コード</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">項目名</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-600">上限点</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">計算方法</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">説明</th>
                    {canManage && <th className="text-center py-2 px-3 font-medium text-gray-600">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono text-xs">{item.code}</td>
                      <td className="py-2 px-3 font-medium">{item.name}</td>
                      <td className="py-2 px-3 text-center">{item.max_score ?? '—'}</td>
                      <td className="py-2 px-3 text-gray-600 text-xs">
                        {CALC_TYPES.find(t => t.value === item.calculation_type)?.label ?? item.calculation_type}
                      </td>
                      <td className="py-2 px-3 text-gray-400 text-xs max-w-[12rem] truncate">
                        {item.description ?? ''}
                      </td>
                      {canManage && (
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => setDeleteConfirm(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 追加・編集ダイアログ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? '表彰項目を編集' : '表彰項目を追加'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label required>コード</Label>
                <Input placeholder="ATTEND_RATE" className="uppercase"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1.5">
                <Label required>上限点数</Label>
                <Input type="number" min={0} placeholder="なし"
                  value={form.max_score}
                  onChange={e => setForm(f => ({ ...f, max_score: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label required>項目名</Label>
              <Input placeholder="例：出席率加点"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>計算方法</Label>
              <Select value={form.calculation_type}
                onValueChange={v => setForm(f => ({ ...f, calculation_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CALC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>説明</Label>
              <Textarea value={form.description} rows={2}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSubmit} loading={loading}>
              {editTarget ? '更新する' : '追加する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認 */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>表彰項目の削除</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 py-2">この表彰項目を削除しますか？スコアデータも影響を受けます。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>キャンセル</Button>
            <Button variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              loading={loading}>
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
