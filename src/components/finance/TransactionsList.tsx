'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { Plus, Download, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { formatDate, formatCurrency, exportToCSV } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';
import type { Transaction, UserRole } from '@/types';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/types';
import { canManageFinance } from '@/lib/hooks/useAuth';

interface PaginationInfo {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

interface TransactionsListProps {
  transactions: Transaction[];
  meetings: { id: string; title: string; date: string }[];
  clubId: string;
  userRole: UserRole;
  pagination: PaginationInfo;
  filters: { type: string; year: string; month: string };
  summary: { incomeTotal: number; expenseTotal: number };
}

export default function TransactionsList({
  transactions: init,
  meetings,
  clubId,
  userRole,
  pagination,
  filters,
  summary,
}: TransactionsListProps) {
  const [transactions, setTransactions] = useState(init);
  const [showDialog, setShowDialog] = useState(false);
  const [formType, setFormType] = useState<'income' | 'expense'>('income');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canManage = canManageFinance(userRole);

  const [form, setForm] = useState({
    transaction_type: 'income' as 'income' | 'expense',
    category: '',
    amount: '',
    payer_name: '',
    payee_name: '',
    payment_method: 'cash',
    transaction_date: new Date().toISOString().split('T')[0],
    description: '',
    meeting_id: '',
  });

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const monthsList = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const openDialog = (type: 'income' | 'expense') => {
    setFormType(type);
    setForm(prev => ({ ...prev, transaction_type: type, category: '', amount: '', payer_name: '', payee_name: '' }));
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.category || !form.amount || !form.transaction_date) {
      toast.error('カテゴリ、金額、日付は必須です');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId,
          meetingId: form.meeting_id || null,
          transactionType: form.transaction_type,
          category: form.category,
          amount: parseInt(form.amount),
          payerName: form.payer_name || null,
          payeeName: form.payee_name || null,
          paymentMethod: form.payment_method,
          transactionDate: form.transaction_date,
          description: form.description || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowDialog(false);
      toast.success('収支を登録しました');
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '登録失敗');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    exportToCSV(transactions.map(t => ({
      '日付': t.transaction_date,
      '種別': t.transaction_type === 'income' ? '収入' : '支出',
      'カテゴリ': t.category,
      '金額': t.amount,
      '支払者': t.payer_name || '',
      '受取者': t.payee_name || '',
      '支払方法': t.payment_method || '',
      '例会': (t as any).meeting?.title || '',
      '備考': t.description || '',
    })), `収支一覧_${filters.year}`);
  };

  const categories = formType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="page-header">
        <div>
          <h1 className="page-title">収支管理</h1>
          <p className="text-gray-500 text-sm mt-1">
            {filters.year}年 全{pagination.totalCount}件
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" />CSV
          </Button>
          {canManage && (
            <>
              <Button variant="success" onClick={() => openDialog('income')}>
                <TrendingUp className="h-4 w-4" />収入登録
              </Button>
              <Button variant="destructive" onClick={() => openDialog('expense')}>
                <TrendingDown className="h-4 w-4" />支出登録
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 年間サマリー */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <p className="text-xs text-green-600 mb-1">{filters.year}年 収入合計</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(summary.incomeTotal)}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <p className="text-xs text-red-600 mb-1">{filters.year}年 支出合計</p>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(summary.expenseTotal)}</p>
          </CardContent>
        </Card>
        <Card className={summary.incomeTotal >= summary.expenseTotal ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}>
          <CardContent className="p-4">
            <p className="text-xs mb-1" style={{ color: summary.incomeTotal >= summary.expenseTotal ? '#2563eb' : '#ea580c' }}>
              差引収支
            </p>
            <p className="text-2xl font-bold" style={{ color: summary.incomeTotal >= summary.expenseTotal ? '#1d4ed8' : '#c2410c' }}>
              {formatCurrency(summary.incomeTotal - summary.expenseTotal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* フィルター */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            {/* 年フィルタ */}
            <Select value={filters.year} onValueChange={v => updateFilter('year', v)}>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="年" />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 月フィルタ */}
            <Select value={filters.month} onValueChange={v => updateFilter('month', v)}>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="月" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全月</SelectItem>
                {monthsList.map(m => (
                  <SelectItem key={m} value={m}>{parseInt(m)}月</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 種別フィルタ */}
            <Select value={filters.type} onValueChange={v => updateFilter('type', v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="種別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="income">収入のみ</SelectItem>
                <SelectItem value="expense">支出のみ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ページネーション（上部） */}
      {pagination.totalPages > 1 && (
        <Pagination {...pagination} className="border border-gray-200 rounded-lg bg-white px-4" />
      )}

      {/* 一覧テーブル */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日付</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">種別</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">カテゴリ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">金額</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">内容・備考</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    データがありません
                  </td>
                </tr>
              ) : transactions.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{t.transaction_date}</td>
                  <td className="px-4 py-3">
                    <Badge className={t.transaction_type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                      {t.transaction_type === 'income' ? '収入' : '支出'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{t.category}</td>
                  <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${t.transaction_type === 'income' ? 'text-green-700' : 'text-red-700'}`}>
                    {t.transaction_type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {(t as any).meeting?.title && (
                      <span className="text-blue-600 mr-2">{(t as any).meeting.title}</span>
                    )}
                    {t.description}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td colSpan={3} className="px-4 py-2 font-medium text-gray-700">
                  表示中 {pagination.totalCount > 0
                    ? `${(pagination.page - 1) * pagination.pageSize + 1}〜${Math.min(pagination.page * pagination.pageSize, pagination.totalCount)}`
                    : '0'}件
                </td>
                <td className="px-4 py-2 text-right font-bold text-gray-900">
                  {formatCurrency(
                    transactions.filter(t => t.transaction_type === 'income').reduce((s, t) => s + t.amount, 0) -
                    transactions.filter(t => t.transaction_type === 'expense').reduce((s, t) => s + t.amount, 0)
                  )}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ページネーション（下部） */}
      {pagination.totalPages > 1 && (
        <Pagination {...pagination} className="border border-gray-200 rounded-lg bg-white px-4" />
      )}

      {/* 登録ダイアログ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{formType === 'income' ? '収入登録' : '支出登録'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="form-group">
              <Label required>カテゴリ</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="form-group">
              <Label required>金額（円）</Label>
              <Input
                type="number"
                min="0"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="form-group">
              <Label required>日付</Label>
              <Input
                type="date"
                value={form.transaction_date}
                onChange={e => setForm({ ...form, transaction_date: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="form-group">
              <Label>例会（関連付ける場合）</Label>
              <Select value={form.meeting_id} onValueChange={v => setForm({ ...form, meeting_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="例会を選択" /></SelectTrigger>
                <SelectContent>
                  {meetings.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.title} ({formatDate(m.date)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="form-group">
              <Label>支払方法</Label>
              <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">現金</SelectItem>
                  <SelectItem value="bank_transfer">振込</SelectItem>
                  <SelectItem value="paypay">PayPay</SelectItem>
                  <SelectItem value="other">その他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="form-group">
              <Label>備考・内容</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSave} loading={loading}>登録</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
