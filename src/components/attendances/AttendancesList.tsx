'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MEMBER_TYPE_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/types';

interface AttendanceRow {
  id: string;
  externalName: string | null;
  externalEmail: string | null;
  clubName: string | null;
  memberType: string;
  feeAmount: number;
  paymentStatus: string;
  registeredAt: string | null;
  meetingId: string;
  meeting: { title: string; date: string } | null;
}

interface Props {
  list: AttendanceRow[];
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

export default function AttendancesList({ list, page, totalPages, totalCount, pageSize }: Props) {
  const [rows, setRows] = useState(list);

  // 編集モーダル
  const [editTarget, setEditTarget] = useState<AttendanceRow | null>(null);
  const [editForm, setEditForm] = useState({
    externalName: '',
    externalEmail: '',
    clubName: '',
    memberType: '',
  });
  const [saving, setSaving] = useState(false);

  const openEdit = (a: AttendanceRow) => {
    setEditTarget(a);
    setEditForm({
      externalName: a.externalName || '',
      externalEmail: a.externalEmail || '',
      clubName: a.clubName || '',
      memberType: a.memberType || 'RAC',
    });
  };

  const closeEdit = () => {
    setEditTarget(null);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/attendances/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalName: editForm.externalName,
          externalEmail: editForm.externalEmail,
          clubName: editForm.clubName,
          memberType: editForm.memberType,
        }),
      });
      if (!res.ok) {
        toast.error('更新に失敗しました');
        return;
      }
      setRows(prev => prev.map(r =>
        r.id === editTarget.id
          ? { ...r, externalName: editForm.externalName, externalEmail: editForm.externalEmail, clubName: editForm.clubName, memberType: editForm.memberType }
          : r
      ));
      toast.success('情報を更新しました');
      closeEdit();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="bg-white border rounded-xl overflow-hidden">
        {/* デスクトップ */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-gray-600">氏名</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">操作</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">所属クラブ</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">種別</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">例会</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">開催日</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">参加費</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">支払</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">詳細</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="font-medium">{a.externalName ?? '—'}</div>
                    {a.externalEmail && <div className="text-xs text-gray-400">{a.externalEmail}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => openEdit(a)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="名前・所属を編集"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="py-3 px-4 text-gray-600 text-xs">{a.clubName ?? '—'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-xs text-gray-500">
                      {MEMBER_TYPE_LABELS[a.memberType as keyof typeof MEMBER_TYPE_LABELS] ?? a.memberType}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600 text-xs max-w-[12rem] truncate">
                    {a.meeting?.title ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs">
                    {a.meeting?.date ? formatDate(a.meeting.date) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs">
                    {formatCurrency(a.feeAmount)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLORS[a.paymentStatus as keyof typeof PAYMENT_STATUS_COLORS] ?? ''}`}>
                      {PAYMENT_STATUS_LABELS[a.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS] ?? a.paymentStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Link href={`/meetings/${a.meetingId}/attendances`} className="text-xs text-blue-600 hover:underline">
                      出席管理
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* モバイル */}
        <div className="sm:hidden divide-y">
          {rows.map(a => (
            <div key={a.id} className="p-4 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-medium truncate">{a.externalName ?? '—'}</p>
                  {/* 鉛筆ボタン */}
                  <button
                    onClick={() => openEdit(a)}
                    className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="名前・所属を編集"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLORS[a.paymentStatus as keyof typeof PAYMENT_STATUS_COLORS] ?? ''}`}>
                  {PAYMENT_STATUS_LABELS[a.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS] ?? a.paymentStatus}
                </span>
              </div>
              <p className="text-xs text-gray-400">{a.clubName ?? ''}</p>
              <div className="text-xs text-gray-500">
                {a.meeting?.title ?? ''} / {formatCurrency(a.feeAmount)}
              </div>
            </div>
          ))}
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          className="border-t px-4"
        />
      </div>

      {/* 編集モーダル */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-900">参加者情報を編集</h2>
              <button onClick={closeEdit} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ボディ */}
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">お名前</label>
                <Input
                  value={editForm.externalName}
                  onChange={e => setEditForm(f => ({ ...f, externalName: e.target.value }))}
                  placeholder="例: 山田 太郎"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <Input
                  type="email"
                  value={editForm.externalEmail}
                  onChange={e => setEditForm(f => ({ ...f, externalEmail: e.target.value }))}
                  placeholder="例: taro@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所属クラブ</label>
                <Input
                  value={editForm.clubName}
                  onChange={e => setEditForm(f => ({ ...f, clubName: e.target.value }))}
                  placeholder="例: ○○ローターアクトクラブ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">区分</label>
                <Select value={editForm.memberType} onValueChange={v => setEditForm(f => ({ ...f, memberType: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="区分を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RAC">RAC</SelectItem>
                    <SelectItem value="RC">RC</SelectItem>
                    <SelectItem value="OB_OG">OB・OG</SelectItem>
                    <SelectItem value="GUEST">ゲスト</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* フッター */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <Button variant="outline" size="sm" onClick={closeEdit} disabled={saving}>
                キャンセル
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={saving}>
                {saving ? '保存中…' : '保存する'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
