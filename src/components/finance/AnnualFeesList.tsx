'use client';

import { useState, useCallback } from 'react';

import { AnnualFee, UserRole, PaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

// ============================================================
// 型定義
// ============================================================
interface Member {
  id: string;
  name: string;
  email: string;
}

interface AnnualFeesListProps {
  annualFees: AnnualFee[];
  members: Member[];
  clubId: string;
  currentYear: number;
  userRole: UserRole;
}

// 年度の選択肢（現在年度±2年）
function getYearOptions(currentYear: number): number[] {
  return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function AnnualFeesList({
  annualFees: initialFees,
  members,
  clubId,
  currentYear,
  userRole,
}: AnnualFeesListProps) {
  // State
  const [fees, setFees] = useState<AnnualFee[]>(initialFees);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchName, setSearchName] = useState('');
  const [loading, setLoading] = useState(false);

  // ダイアログ状態
  const [paymentDialog, setPaymentDialog] = useState<{
    open: boolean;
    fee: AnnualFee | null;
  }>({ open: false, fee: null });
  const [bulkCreateDialog, setBulkCreateDialog] = useState(false);
  const [bulkCreateYear, setBulkCreateYear] = useState<number>(currentYear);
  const [bulkCreateAmount, setBulkCreateAmount] = useState<string>('6000');
  const [bulkExemptMembers, setBulkExemptMembers] = useState<string[]>([]);

  // 支払更新用フォーム
  const [paymentForm, setPaymentForm] = useState({
    payment_status: 'paid' as PaymentStatus,
    payment_method: 'cash',
    paid_at: new Date().toISOString().split('T')[0],
    note: '',
  });

  // 権限チェック
  const canEdit =
    userRole === 'system_owner' ||
    userRole === 'club_admin' ||
    userRole === 'president' ||
    userRole === 'treasurer';

  // ============================================================
  // 年度切替時にデータ再取得
  // ============================================================
  const fetchFeesByYear = useCallback(
    async (year: number) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/finance/annual-fees?clubId=${clubId}&fiscalYear=${year}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setFees(data ?? []);
      } catch (err) {
        toast.error('年会費データの取得に失敗しました');
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [clubId]
  );

  const handleYearChange = (year: string) => {
    const y = Number(year);
    setSelectedYear(y);
    fetchFeesByYear(y);
  };

  // ============================================================
  // フィルタリング
  // ============================================================
  const filteredFees = fees.filter((fee) => {
    const nameMatch =
      searchName === '' ||
      fee.user?.name?.includes(searchName) ||
      false;
    const statusMatch = filterStatus === 'all' || fee.payment_status === filterStatus;
    return nameMatch && statusMatch;
  });

  // ============================================================
  // 集計
  // ============================================================
  const totalCount = fees.length;
  const paidCount = fees.filter((f) => f.payment_status === 'paid').length;
  const unpaidCount = fees.filter((f) => f.payment_status === 'unpaid').length;
  const totalAmount = fees.reduce((sum, f) => sum + (f.amount || 0), 0);
  const paidAmount = fees
    .filter((f) => f.payment_status === 'paid')
    .reduce((sum, f) => sum + (f.amount || 0), 0);
  const unpaidAmount = fees
    .filter((f) => f.payment_status === 'unpaid')
    .reduce((sum, f) => sum + (f.amount || 0), 0);

  // ============================================================
  // 支払状況更新
  // ============================================================
  const openPaymentDialog = (fee: AnnualFee) => {
    setPaymentForm({
      payment_status: fee.payment_status === 'paid' ? 'unpaid' : 'paid',
      payment_method: fee.payment_method || 'cash',
      paid_at: fee.paid_at
        ? fee.paid_at.split('T')[0]
        : new Date().toISOString().split('T')[0],
      note: fee.note || '',
    });
    setPaymentDialog({ open: true, fee });
  };

  const handlePaymentUpdate = async () => {
    if (!paymentDialog.fee) return;
    setLoading(true);
    try {
      const updateData: Record<string, unknown> = {
        payment_status: paymentForm.payment_status,
        note: paymentForm.note || null,
        updated_at: new Date().toISOString(),
      };
      if (paymentForm.payment_status === 'paid') {
        updateData.payment_method = paymentForm.payment_method;
        updateData.paid_at = paymentForm.paid_at;
      } else {
        updateData.payment_method = null;
        updateData.paid_at = null;
      }

      const res = await fetch(`/api/finance/annual-fees/${paymentDialog.fee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus: paymentForm.payment_status,
          paymentMethod: paymentForm.payment_status === 'paid' ? paymentForm.payment_method : null,
          paidAt: paymentForm.payment_status === 'paid' ? paymentForm.paid_at : null,
          note: paymentForm.note || null,
        }),
      });
      if (!res.ok) throw new Error();

      setFees((prev) =>
        prev.map((f) =>
          f.id === paymentDialog.fee!.id
            ? {
                ...f,
                payment_status: paymentForm.payment_status,
                payment_method:
                  paymentForm.payment_status === 'paid'
                    ? paymentForm.payment_method
                    : null,
                paid_at:
                  paymentForm.payment_status === 'paid'
                    ? paymentForm.paid_at
                    : null,
                note: paymentForm.note || null,
              }
            : f
        )
      );

      toast.success('支払状況を更新しました');
      setPaymentDialog({ open: false, fee: null });
    } catch (err) {
      toast.error('更新に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 一括請求作成
  // ============================================================
  const handleBulkCreate = async () => {
    setLoading(true);
    try {
      // 既存年会費を確認してから一括作成
      const existingRes = await fetch(`/api/finance/annual-fees?clubId=${clubId}&fiscalYear=${bulkCreateYear}`);
      const existingFees = existingRes.ok ? await existingRes.json() : [];
      const existingUserIds = new Set((existingFees as {userId: string}[]).map((f) => f.userId));
      const targetMembers = members.filter(
        (m) => !existingUserIds.has(m.id) && !bulkExemptMembers.includes(m.id)
      );

      if (targetMembers.length === 0) {
        toast.info('新規に作成する年会費レコードがありません（全メンバー分が作成済みです）');
        setBulkCreateDialog(false);
        setLoading(false);
        return;
      }

      // 一括作成（1件ずつAPI経由）
      let created = 0;
      for (const m of targetMembers) {
        const res = await fetch('/api/finance/annual-fees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clubId, userId: m.id, fiscalYear: bulkCreateYear,
            amount: Number(bulkCreateAmount), paymentStatus: 'unpaid',
          }),
        });
        if (res.ok) created++;
      }

      toast.success(`${created}件の年会費請求を作成しました`);
      setBulkCreateDialog(false);
      await fetchFeesByYear(selectedYear);
    } catch (err) {
      toast.error('一括作成に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // CSV出力
  // ============================================================
  const handleCsvExport = () => {
    const BOM = '\uFEFF';
    const headers = ['氏名', '年度', '金額', '支払状況', '支払方法', '支払日', 'メモ'];
    const rows = filteredFees.map((fee) => [
      fee.user?.name ?? '',
      fee.fiscal_year,
      fee.amount,
      PAYMENT_STATUS_LABELS[fee.payment_status] ?? fee.payment_status,
      fee.payment_method
        ? (PAYMENT_METHOD_LABELS as Record<string, string>)[fee.payment_method] ?? fee.payment_method
        : '',
      fee.paid_at ? fee.paid_at.split('T')[0] : '',
      fee.note ?? '',
    ]);

    const csvContent =
      BOM +
      [headers, ...rows]
        .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `年会費一覧_${selectedYear}年度.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSVを出力しました');
  };

  // ============================================================
  // 免除設定トグル
  // ============================================================
  const toggleExemptMember = (memberId: string) => {
    setBulkExemptMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  // ============================================================
  // レンダリング
  // ============================================================
  return (
    <div className="space-y-6">
      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 font-medium">対象人数</p>
            <p className="text-2xl font-bold text-blue-700">{totalCount}名</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <p className="text-xs text-green-600 font-medium">支払済</p>
            <p className="text-2xl font-bold text-green-700">{paidCount}名</p>
            <p className="text-xs text-green-600">{formatCurrency(paidAmount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <p className="text-xs text-red-600 font-medium">未払い</p>
            <p className="text-2xl font-bold text-red-700">{unpaidCount}名</p>
            <p className="text-xs text-red-600">{formatCurrency(unpaidAmount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-600 font-medium">合計請求額</p>
            <p className="text-2xl font-bold text-gray-700">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 進捗バー */}
      {totalCount > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">支払進捗</span>
              <span className="font-medium text-gray-800">
                {paidCount}/{totalCount}名 ({Math.round((paidCount / totalCount) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (paidCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ツールバー */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">年会費一覧</CardTitle>
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBulkCreateYear(currentYear);
                    setBulkCreateAmount('6000');
                    setBulkExemptMembers([]);
                    setBulkCreateDialog(true);
                  }}
                >
                  一括作成
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleCsvExport}>
                CSV出力
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col gap-3 sm:flex-row mb-4">
            <Select value={String(selectedYear)} onValueChange={handleYearChange}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getYearOptions(currentYear).map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}年度
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="支払状況" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="unpaid">未払い</SelectItem>
                <SelectItem value="paid">支払済</SelectItem>
                <SelectItem value="exempt">免除</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="名前で検索..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="w-full sm:w-48"
            />
          </div>

          {/* テーブル（デスクトップ） */}
          {loading ? (
            <div className="py-16 text-center text-gray-400">読み込み中...</div>
          ) : filteredFees.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p className="text-lg mb-2">該当データがありません</p>
              {fees.length === 0 && canEdit && (
                <p className="text-sm">
                  「一括作成」ボタンで年会費レコードを作成してください
                </p>
              )}
            </div>
          ) : (
            <>
              {/* デスクトップ表示 */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-gray-600">氏名</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-600">金額</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-600">支払状況</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">支払方法</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">支払日</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">メモ</th>
                      {canEdit && (
                        <th className="text-center py-2 px-3 font-medium text-gray-600">操作</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFees.map((fee) => (
                      <tr key={fee.id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-medium text-gray-800">{fee.user?.name ?? '—'}</div>
                          <div className="text-xs text-gray-400">{fee.user?.email ?? ''}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {formatCurrency(fee.amount)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              PAYMENT_STATUS_COLORS[fee.payment_status]
                            }`}
                          >
                            {PAYMENT_STATUS_LABELS[fee.payment_status]}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-gray-600">
                          {fee.payment_method
                            ? (PAYMENT_METHOD_LABELS as Record<string, string>)[fee.payment_method] ??
                              fee.payment_method
                            : '—'}
                        </td>
                        <td className="py-3 px-3 text-gray-600">
                          {fee.paid_at ? formatDate(fee.paid_at) : '—'}
                        </td>
                        <td className="py-3 px-3 text-gray-500 text-xs max-w-[12rem] truncate">
                          {fee.note ?? ''}
                        </td>
                        {canEdit && (
                          <td className="py-3 px-3 text-center">
                            <Button
                              size="sm"
                              variant={
                                fee.payment_status === 'paid' ? 'outline' : 'default'
                              }
                              onClick={() => openPaymentDialog(fee)}
                              className="text-xs"
                            >
                              {fee.payment_status === 'paid' ? '未払いに戻す' : '支払登録'}
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* モバイル表示 */}
              <div className="sm:hidden space-y-3">
                {filteredFees.map((fee) => (
                  <div
                    key={fee.id}
                    className="border rounded-lg p-4 space-y-2 bg-white shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-gray-800">
                          {fee.user?.name ?? '—'}
                        </div>
                        <div className="text-xs text-gray-400">{fee.user?.email ?? ''}</div>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          PAYMENT_STATUS_COLORS[fee.payment_status]
                        }`}
                      >
                        {PAYMENT_STATUS_LABELS[fee.payment_status]}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">金額</span>
                      <span className="font-mono font-medium">{formatCurrency(fee.amount)}</span>
                    </div>

                    {fee.payment_method && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">支払方法</span>
                        <span>
                          {(PAYMENT_METHOD_LABELS as Record<string, string>)[fee.payment_method] ??
                            fee.payment_method}
                        </span>
                      </div>
                    )}

                    {fee.paid_at && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">支払日</span>
                        <span>{formatDate(fee.paid_at)}</span>
                      </div>
                    )}

                    {fee.note && (
                      <p className="text-xs text-gray-400 border-t pt-2">{fee.note}</p>
                    )}

                    {canEdit && (
                      <div className="pt-2 border-t">
                        <Button
                          size="sm"
                          variant={fee.payment_status === 'paid' ? 'outline' : 'default'}
                          onClick={() => openPaymentDialog(fee)}
                          className="w-full text-xs"
                        >
                          {fee.payment_status === 'paid' ? '未払いに戻す' : '支払登録'}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 支払登録ダイアログ */}
      {/* ============================================================ */}
      <Dialog
        open={paymentDialog.open}
        onOpenChange={(open) => setPaymentDialog({ open, fee: open ? paymentDialog.fee : null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>支払状況の更新</DialogTitle>
          </DialogHeader>

          {paymentDialog.fee && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-medium text-gray-800">{paymentDialog.fee.user?.name}</p>
                <p className="text-gray-500">
                  {paymentDialog.fee.fiscal_year}年度 —{' '}
                  {formatCurrency(paymentDialog.fee.amount)}
                </p>
              </div>

              {/* 支払状況 */}
              <div className="space-y-1.5">
                <Label>支払状況</Label>
                <Select
                  value={paymentForm.payment_status}
                  onValueChange={(v) =>
                    setPaymentForm((f) => ({ ...f, payment_status: v as PaymentStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">支払済</SelectItem>
                    <SelectItem value="unpaid">未払い</SelectItem>
                    <SelectItem value="exempt">免除</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 支払済の場合のみ表示 */}
              {paymentForm.payment_status === 'paid' && (
                <>
                  <div className="space-y-1.5">
                    <Label>支払方法</Label>
                    <Select
                      value={paymentForm.payment_method}
                      onValueChange={(v) =>
                        setPaymentForm((f) => ({ ...f, payment_method: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">現金</SelectItem>
                        <SelectItem value="bank_transfer">振込</SelectItem>
                        <SelectItem value="paypay">PayPay</SelectItem>
                        <SelectItem value="other">その他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>支払日</Label>
                    <Input
                      type="date"
                      value={paymentForm.paid_at}
                      onChange={(e) =>
                        setPaymentForm((f) => ({ ...f, paid_at: e.target.value }))
                      }
                    />
                  </div>
                </>
              )}

              {/* メモ */}
              <div className="space-y-1.5">
                <Label>メモ</Label>
                <Input
                  placeholder="メモ（任意）"
                  value={paymentForm.note}
                  onChange={(e) =>
                    setPaymentForm((f) => ({ ...f, note: e.target.value }))
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentDialog({ open: false, fee: null })}
            >
              キャンセル
            </Button>
            <Button onClick={handlePaymentUpdate} disabled={loading}>
              {loading ? '更新中...' : '更新する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* 一括作成ダイアログ */}
      {/* ============================================================ */}
      <Dialog open={bulkCreateDialog} onOpenChange={setBulkCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>年会費の一括作成</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-500">
              全アクティブメンバーに対して年会費レコードを一括作成します。既にレコードが存在するメンバーはスキップされます。
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label required>対象年度</Label>
                <Select
                  value={String(bulkCreateYear)}
                  onValueChange={(v) => setBulkCreateYear(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getYearOptions(currentYear).map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}年度
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label required>年会費金額（円）</Label>
                <Input
                  type="number"
                  value={bulkCreateAmount}
                  onChange={(e) => setBulkCreateAmount(e.target.value)}
                  min={0}
                  step={100}
                />
              </div>
            </div>

            {members.length > 0 && (
              <div className="space-y-2">
                <Label>免除するメンバー（チェックで除外）</Label>
                <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkExemptMembers.includes(m.id)}
                        onChange={() => toggleExemptMember(m.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">{m.name}</span>
                      <span className="text-xs text-gray-400">{m.email}</span>
                    </label>
                  ))}
                </div>
                {bulkExemptMembers.length > 0 && (
                  <p className="text-xs text-amber-600">
                    {bulkExemptMembers.length}名を除外します
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCreateDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleBulkCreate} disabled={loading}>
              {loading ? '作成中...' : '一括作成する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
