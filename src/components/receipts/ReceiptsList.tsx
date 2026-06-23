'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Plus, Download, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatDate, formatCurrency, exportToCSV } from '@/lib/utils';
import type { Receipt, UserRole } from '@/types';
import { RECEIPT_STATUS_LABELS } from '@/types';
import { canManageReceipts } from '@/lib/hooks/useAuth';

interface ReceiptsListProps {
  receipts: Receipt[];
  pendingAttendances: Record<string, unknown>[];
  meetings: { id: string; title: string }[];
  clubId: string;
  clubName: string;
  userRole: UserRole;
  totalCount?: number;
}

export default function ReceiptsList({
  receipts: init, pendingAttendances, meetings, clubId, clubName, userRole, totalCount
}: ReceiptsListProps) {
  const [receipts, setReceipts] = useState(init);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const canManage = canManageReceipts(userRole);

  const [form, setForm] = useState({
    receipt_name: '',
    amount: '',
    description: 'ローターアクトクラブ例会登録料として',
    issued_date: new Date().toISOString().split('T')[0],
    meeting_id: '',
    attendance_id: '',
  });

  const handleCreate = async () => {
    if (!form.receipt_name || !form.amount || !form.description || !form.issued_date) {
      toast.error('必須項目を入力してください');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId,
          meetingId: form.meeting_id || null,
          attendanceId: form.attendance_id || null,
          receiptName: form.receipt_name,
          amount: parseInt(form.amount),
          description: form.description,
          issuedDate: form.issued_date,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '発行に失敗しました');

      // 新しく作成した領収書をリストの先頭に追加
      const newReceipt: Receipt = {
        id: data.id,
        club_id: clubId,
        meeting_id: form.meeting_id || null,
        attendance_id: form.attendance_id || null,
        transaction_id: null,
        receipt_number: data.receiptNumber,
        receipt_name: form.receipt_name,
        amount: parseInt(form.amount),
        description: form.description,
        issued_date: form.issued_date,
        pdf_url: null,
        status: 'issued',
        issued_by: null,
        cancel_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };
      setReceipts(prev => [newReceipt, ...prev]);
      setShowCreateDialog(false);
      setForm({
        receipt_name: '',
        amount: '',
        description: 'ローターアクトクラブ例会登録料として',
        issued_date: new Date().toISOString().split('T')[0],
        meeting_id: '',
        attendance_id: '',
      });
      toast.success(`領収書 ${data.receiptNumber} を発行しました`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '発行に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!cancelReason) {
      toast.error('取消理由を入力してください');
      return;
    }
    try {
      const response = await fetch(`/api/receipts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', cancelReason }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '取消に失敗しました');
      }

      setReceipts(prev => prev.map(r =>
        r.id === id ? { ...r, status: 'cancelled' as const, cancel_reason: cancelReason } : r
      ));
      setShowCancelDialog(null);
      setCancelReason('');
      toast.success('領収書を取り消しました');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '取消に失敗しました');
    }
  };

  const exportCSV = () => {
    exportToCSV(receipts.map(r => ({
      '領収書番号': r.receipt_number,
      '宛名': r.receipt_name,
      '金額': r.amount,
      '但し書き': r.description,
      '発行日': r.issued_date,
      'ステータス': RECEIPT_STATUS_LABELS[r.status],
      '例会': (r as any).meeting?.title || '',
    })), '領収書一覧');
  };

  const statusColors = {
    issued: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    reissued: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">領収書管理</h1>
          <p className="text-gray-500 text-sm mt-1">{totalCount ?? receipts.length}件</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4" />CSV</Button>
          {canManage && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />領収書を発行
            </Button>
          )}
        </div>
      </div>

      {/* 領収書発行待ち */}
      {pendingAttendances.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <p className="text-sm font-medium text-yellow-700">
                {pendingAttendances.length}件の領収書発行待ちがあります
              </p>
            </div>
            <div className="space-y-1">
              {pendingAttendances.slice(0, 5).map((a, i) => (
                <div key={i} className="text-xs text-yellow-700 flex items-center gap-2">
                  <span>・{String(a.external_name || '')} / {String((a.meeting as any)?.title || '')}</span>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs border-yellow-400 text-yellow-700 hover:bg-yellow-100"
                      onClick={() => {
                        setForm(prev => ({
                          ...prev,
                          receipt_name: String(a.receipt_name || a.external_name || ''),
                          amount: String(a.fee_amount || 0),
                          attendance_id: String(a.id),
                          meeting_id: String(a.meeting_id || ''),
                        }));
                        setShowCreateDialog(true);
                      }}
                    >
                      発行
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 一覧 */}
      {receipts.length === 0 ? (
        <div className="empty-state">
          <p className="text-gray-500">領収書がありません</p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">領収書番号</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">宛名</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">金額</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">但し書き</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">発行日</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receipts.map(receipt => (
                  <tr key={receipt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-sm text-blue-600">{receipt.receipt_number}</td>
                    <td className="px-4 py-3 font-medium">{receipt.receipt_name}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(receipt.amount)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate">{receipt.description}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(receipt.issued_date)}</td>
                    <td className="px-4 py-3">
                      <Badge className={statusColors[receipt.status]}>{RECEIPT_STATUS_LABELS[receipt.status]}</Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {receipt.status === 'issued' && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => setShowCancelDialog(receipt.id)}
                              title="取消"
                            >
                              <X className="h-4 w-4" />
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
      )}

      {/* 発行ダイアログ */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>領収書を発行</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="form-group">
              <Label required>宛名</Label>
              <Input value={form.receipt_name} onChange={e => setForm({...form, receipt_name: e.target.value})} placeholder="〇〇クラブ 御中" className="mt-1" />
            </div>
            <div className="form-group">
              <Label required>金額（円）</Label>
              <Input type="number" min="0" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="mt-1" />
            </div>
            <div className="form-group">
              <Label required>但し書き</Label>
              <Select value={form.description} onValueChange={v => setForm({...form, description: v})}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ローターアクトクラブ例会登録料として">例会登録料</SelectItem>
                  <SelectItem value="年会費として">年会費</SelectItem>
                  <SelectItem value="ニコニコ寄付金として">ニコニコ寄付金</SelectItem>
                  <SelectItem value="お弁当代として">お弁当代</SelectItem>
                  <SelectItem value="その他">その他（自由入力）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="form-group">
              <Label required>発行日</Label>
              <Input type="date" value={form.issued_date} onChange={e => setForm({...form, issued_date: e.target.value})} className="mt-1" />
            </div>
            <div className="form-group">
              <Label>関連例会</Label>
              <Select value={form.meeting_id} onValueChange={v => setForm({...form, meeting_id: v})}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>
                  {meetings.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
              ⚠️ 発行後の内容変更はできません。取消・再発行が必要です。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>キャンセル</Button>
            <Button onClick={handleCreate} loading={loading}>発行する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 取消ダイアログ */}
      <Dialog open={!!showCancelDialog} onOpenChange={() => setShowCancelDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>領収書を取り消す</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-gray-600 mb-3">取消理由を入力してください。この操作は元に戻せません。</p>
            <Textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="取消理由を入力..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(null)}>キャンセル</Button>
            <Button
              variant="destructive"
              onClick={() => showCancelDialog && handleCancel(showCancelDialog)}
            >
              取り消す
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
