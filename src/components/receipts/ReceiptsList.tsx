'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Plus, Download, X, AlertCircle, Layers, Printer, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
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

interface BulkTarget {
  id: string;
  name: string;
  amount: number;
  isClubMember?: boolean;
  alreadyIssued?: boolean;
  paidAt?: string | null;
}

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
  const router = useRouter();

  // ── 一括発行ダイアログ ──
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkMode, setBulkMode] = useState<'external' | 'annual_fee'>('external');
  const [bulkMeetingId, setBulkMeetingId] = useState('');
  const [bulkFiscalYear, setBulkFiscalYear] = useState<string>(String(new Date().getFullYear()));
  const [bulkIssuedDate, setBulkIssuedDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkTargets, setBulkTargets] = useState<BulkTarget[]>([]);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number } | null>(null);
  const [bulkStep, setBulkStep] = useState<'config' | 'preview' | 'done'>('config');
  const [bulkCreatedIds, setBulkCreatedIds] = useState<string[]>([]);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  // プレビュー取得
  const handleBulkPreview = async () => {
    if (bulkMode === 'external' && !bulkMeetingId) {
      toast.error('例会を選択してください'); return;
    }
    setBulkPreviewLoading(true);
    try {
      const params = new URLSearchParams({ mode: bulkMode, clubId });
      if (bulkMode === 'external') params.set('meetingId', bulkMeetingId);
      else params.set('fiscalYear', bulkFiscalYear);

      const res = await fetch(`/api/receipts/bulk?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const targets: BulkTarget[] = data.targets || [];
      setBulkTargets(targets);
      // 初期選択：未発行のものを全選択
      setBulkSelected(new Set(targets.filter(t => !t.alreadyIssued).map(t => t.id)));
      setBulkStep('preview');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'プレビューの取得に失敗しました');
    } finally {
      setBulkPreviewLoading(false);
    }
  };

  // 一括発行実行
  const handleBulkCreate = async () => {
    const selectedIds = Array.from(bulkSelected);
    if (selectedIds.length === 0) {
      toast.error('発行する対象を選択してください'); return;
    }
    setBulkLoading(true);
    try {
      const res = await fetch('/api/receipts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: bulkMode,
          clubId,
          meetingId: bulkMode === 'external' ? bulkMeetingId : undefined,
          fiscalYear: bulkMode === 'annual_fee' ? Number(bulkFiscalYear) : undefined,
          issuedDate: bulkIssuedDate,
          description: bulkDescription || undefined,
          targetIds: selectedIds,
          skipExisting: false, // 選択制なのでAPIでのスキップは無効化
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const createdIds = (data.created || []).map((r: any) => r.id);
      setBulkCreatedIds(createdIds);
      setBulkResult({ created: data.created?.length ?? 0, skipped: data.skipped?.length ?? 0 });
      setBulkStep('done');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '一括発行に失敗しました');
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleBulkSelect = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllBulk = () => setBulkSelected(new Set(bulkTargets.filter(t => !t.alreadyIssued).map(t => t.id)));
  const clearAllBulk = () => setBulkSelected(new Set());

  const resetBulkDialog = () => {
    setBulkStep('config');
    setBulkTargets([]);
    setBulkSelected(new Set());
    setBulkResult(null);
    setBulkCreatedIds([]);
    setBulkMeetingId('');
    setBulkDescription('');
  };

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
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4" />CSV</Button>
          {canManage && (
            <>
              <Button
                variant="outline"
                onClick={() => { resetBulkDialog(); setShowBulkDialog(true); }}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Layers className="h-4 w-4" />一括発行
              </Button>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />領収書を発行
              </Button>
            </>
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
                  <th className="px-4 py-3" />
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {receipt.status === 'issued' && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-blue-500 hover:text-blue-700"
                            onClick={() => window.open(`/receipts/${receipt.id}/print`, '_blank')}
                            title="印刷"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        )}
                        {canManage && receipt.status === 'issued' && (
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

      {/* ── 一括発行ダイアログ ── */}
      <Dialog open={showBulkDialog} onOpenChange={open => { if (!open) resetBulkDialog(); setShowBulkDialog(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600" />
              領収書の一括発行
            </DialogTitle>
          </DialogHeader>

          {/* Step 1: 設定 */}
          {bulkStep === 'config' && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label required>発行対象</Label>
                <Select value={bulkMode} onValueChange={v => setBulkMode(v as typeof bulkMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="external">例会の外部参加者（クラブメンバー以外）</SelectItem>
                    <SelectItem value="annual_fee">年会費（支払済みメンバー全員）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {bulkMode === 'external'
                    ? '選択した例会で「領収書必要」かつ「支払済み」の外部参加者が対象です。クラブメンバーは含まれません。'
                    : '指定年度の年会費が「支払済み」のメンバー全員が対象です。'}
                </p>
              </div>

              {bulkMode === 'external' && (
                <div className="space-y-1.5">
                  <Label required>対象例会</Label>
                  <Select value={bulkMeetingId} onValueChange={setBulkMeetingId}>
                    <SelectTrigger><SelectValue placeholder="例会を選択..." /></SelectTrigger>
                    <SelectContent>
                      {meetings.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {bulkMode === 'annual_fee' && (
                <div className="space-y-1.5">
                  <Label required>対象年度</Label>
                  <Select value={bulkFiscalYear} onValueChange={setBulkFiscalYear}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {yearOptions.map(y => (
                        <SelectItem key={y} value={String(y)}>{y}年度</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label required>発行日</Label>
                <Input
                  type="date"
                  value={bulkIssuedDate}
                  onChange={e => setBulkIssuedDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>但し書き（空欄で自動設定）</Label>
                <Input
                  placeholder={bulkMode === 'external' ? '例：○○例会 参加費として' : '例：2025年度 年会費として'}
                  value={bulkDescription}
                  onChange={e => setBulkDescription(e.target.value)}
                />
              </div>

              <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                ⚠️ 次のステップで対象者を確認・選択できます。発行後は取消が必要です。
              </p>
            </div>
          )}

          {/* Step 2: プレビュー・選択 */}
          {bulkStep === 'preview' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  発行対象：{bulkTargets.length}件
                  <span className="ml-2 text-blue-600">（選択中：{bulkSelected.size}件）</span>
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllBulk}>全選択</Button>
                  <Button variant="outline" size="sm" onClick={clearAllBulk}>全解除</Button>
                </div>
              </div>

              {bulkTargets.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>対象者が見つかりません</p>
                  <p className="text-xs mt-1">条件を変更してやり直してください</p>
                </div>
              ) : (
                <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                  {bulkTargets.map(t => (
                    <label
                      key={t.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 ${t.alreadyIssued ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={bulkSelected.has(t.id)}
                        disabled={t.alreadyIssued}
                        onChange={() => !t.alreadyIssued && toggleBulkSelect(t.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                        {t.alreadyIssued && (
                          <p className="text-xs text-amber-600">発行済み</p>
                        )}
                      </div>
                      <span className="text-sm font-mono text-gray-700 shrink-0">
                        {formatCurrency(t.amount)}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">発行件数</span>
                  <span className="font-bold">{bulkSelected.size}件</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-600">合計金額</span>
                  <span className="font-bold text-blue-700">
                    {formatCurrency(
                      bulkTargets
                        .filter(t => bulkSelected.has(t.id))
                        .reduce((s, t) => s + t.amount, 0)
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: 完了 */}
          {bulkStep === 'done' && bulkResult && (
            <div className="py-6 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-lg font-bold text-gray-800">
                {bulkResult.created}件の領収書を発行しました
              </p>
              {bulkResult.skipped > 0 && (
                <p className="text-sm text-amber-600">{bulkResult.skipped}件はスキップされました</p>
              )}
              <div className="flex flex-col gap-2 pt-2">
                {bulkCreatedIds.length > 0 && (
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => {
                      const url = `/receipts/bulk-print?ids=${bulkCreatedIds.join(',')}`;
                      window.open(url, '_blank');
                    }}
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    発行した{bulkResult.created}件を一括印刷
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowBulkDialog(false);
                    resetBulkDialog();
                  }}
                >
                  閉じる
                </Button>
              </div>
            </div>
          )}

          {bulkStep !== 'done' && (
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                if (bulkStep === 'preview') setBulkStep('config');
                else { setShowBulkDialog(false); resetBulkDialog(); }
              }}>
                {bulkStep === 'preview' ? '← 戻る' : 'キャンセル'}
              </Button>
              {bulkStep === 'config' && (
                <Button onClick={handleBulkPreview} disabled={bulkPreviewLoading}>
                  {bulkPreviewLoading ? '確認中...' : '対象者を確認 →'}
                </Button>
              )}
              {bulkStep === 'preview' && (
                <Button
                  onClick={handleBulkCreate}
                  disabled={bulkLoading || bulkSelected.size === 0}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {bulkLoading ? '発行中...' : `${bulkSelected.size}件を一括発行`}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
