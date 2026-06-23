'use client';

import { useState } from 'react';

import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { UserRole } from '@/types';
import { canManageFinance } from '@/lib/hooks/useAuth';
import { Heart, Plus, Download } from 'lucide-react';

interface Donation {
  id: string;
  club_id: string;
  meeting_id: string | null;
  donor_name: string;
  donor_user_id: string | null;
  amount: number;
  donation_type: 'niconico' | 'donation' | 'sponsorship';
  reason: string | null;
  transaction_date: string;
  note: string | null;
  created_at: string;
  meeting?: { title: string; date: string } | null;
}

interface DonationsListProps {
  donations: Donation[];
  meetings: { id: string; title: string; date: string }[];
  members: { id: string; name: string }[];
  clubId: string;
  userRole: UserRole;
}

const DONATION_TYPE_LABELS: Record<string, string> = {
  niconico: 'ニコニコ',
  donation: '寄付',
  sponsorship: '協賛金',
};

const DONATION_TYPE_COLORS: Record<string, string> = {
  niconico: 'bg-pink-100 text-pink-700',
  donation: 'bg-purple-100 text-purple-700',
  sponsorship: 'bg-blue-100 text-blue-700',
};

export default function DonationsList({
  donations: initialDonations,
  meetings,
  members,
  clubId,
  userRole,
}: DonationsListProps) {
  const canManage = canManageFinance(userRole);

  const [donations, setDonations] = useState<Donation[]>(initialDonations);
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterMeeting, setFilterMeeting] = useState('all');

  const [form, setForm] = useState({
    donor_name: '',
    donor_user_id: '',
    amount: '',
    donation_type: 'niconico' as 'niconico' | 'donation' | 'sponsorship',
    reason: '',
    transaction_date: new Date().toISOString().split('T')[0],
    meeting_id: '',
    note: '',
  });

  // 集計
  const totalAmount = donations.reduce((s, d) => s + d.amount, 0);
  const niconicoTotal = donations.filter(d => d.donation_type === 'niconico').reduce((s, d) => s + d.amount, 0);
  const donationTotal = donations.filter(d => d.donation_type === 'donation').reduce((s, d) => s + d.amount, 0);
  const niconicoCount = donations.filter(d => d.donation_type === 'niconico').length;

  // フィルター
  const filtered = donations.filter(d => {
    const typeMatch = filterType === 'all' || d.donation_type === filterType;
    const meetingMatch = filterMeeting === 'all' || d.meeting_id === filterMeeting;
    return typeMatch && meetingMatch;
  });

  // フォームリセット
  const resetForm = () => {
    setForm({
      donor_name: '',
      donor_user_id: '',
      amount: '',
      donation_type: 'niconico',
      reason: '',
      transaction_date: new Date().toISOString().split('T')[0],
      meeting_id: '',
      note: '',
    });
  };

  // メンバー選択時に名前自動入力
  const handleMemberSelect = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    setForm(f => ({
      ...f,
      donor_user_id: memberId,
      donor_name: member?.name || f.donor_name,
    }));
  };

  // 登録
  const handleSubmit = async () => {
    if (!form.donor_name.trim()) { toast.error('寄付者名を入力してください'); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('金額を正しく入力してください'); return; }

    setLoading(true);
    try {
      // API経由でtransactionsに収入登録
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId,
          meetingId: form.meeting_id || null,
          transactionType: 'income',
          category: DONATION_TYPE_LABELS[form.donation_type],
          amount: Number(form.amount),
          payerName: form.donor_name,
          paymentMethod: 'cash',
          transactionDate: form.transaction_date,
          description: form.reason || `${DONATION_TYPE_LABELS[form.donation_type]}：${form.donor_name}`,
        }),
      });
      const txData = await res.json();
      if (!res.ok) throw new Error(txData.error);

      const meeting = form.meeting_id
        ? meetings.find(m => m.id === form.meeting_id)
        : null;

      const newDonation: Donation = {
        id: txData.id,
        club_id: clubId,
        meeting_id: form.meeting_id || null,
        donor_name: form.donor_name,
        donor_user_id: form.donor_user_id || null,
        amount: Number(form.amount),
        donation_type: form.donation_type,
        reason: form.reason || null,
        transaction_date: form.transaction_date,
        note: form.note || null,
        created_at: new Date().toISOString(),
        meeting: meeting ? { title: meeting.title, date: meeting.date } : null,
      };

      setDonations(prev => [newDonation, ...prev]);
      toast.success(`${DONATION_TYPE_LABELS[form.donation_type]}を登録しました`);
      setShowDialog(false);
      resetForm();
    } catch (err) {
      toast.error('登録に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // CSV出力
  const handleCsvExport = () => {
    const BOM = '\uFEFF';
    const headers = ['日付', '寄付者名', '種別', '金額', '理由・コメント', '例会'];
    const rows = filtered.map(d => [
      d.transaction_date,
      d.donor_name,
      DONATION_TYPE_LABELS[d.donation_type] ?? d.donation_type,
      d.amount,
      d.reason ?? '',
      d.meeting?.title ?? '',
    ]);
    const csv = BOM + [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ニコニコ寄付一覧.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSVを出力しました');
  };

  return (
    <div className="space-y-6">
      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-pink-50 border-pink-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="h-4 w-4 text-pink-500" />
              <p className="text-xs text-pink-600 font-medium">ニコニコ合計</p>
            </div>
            <p className="text-2xl font-bold text-pink-700">{formatCurrency(niconicoTotal)}</p>
            <p className="text-xs text-pink-500">{niconicoCount}件</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4">
            <p className="text-xs text-purple-600 font-medium">寄付合計</p>
            <p className="text-2xl font-bold text-purple-700">{formatCurrency(donationTotal)}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 font-medium">累計件数</p>
            <p className="text-2xl font-bold text-blue-700">{donations.length}件</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <p className="text-xs text-green-600 font-medium">累計金額</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* リスト */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="h-4 w-4 text-pink-500" />
              ニコニコ・寄付一覧
            </CardTitle>
            <div className="flex gap-2">
              {canManage && (
                <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }}>
                  <Plus className="h-4 w-4 mr-1" />登録
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleCsvExport}>
                <Download className="h-4 w-4 mr-1" />CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col gap-3 sm:flex-row mb-4">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="種別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての種別</SelectItem>
                <SelectItem value="niconico">ニコニコ</SelectItem>
                <SelectItem value="donation">寄付</SelectItem>
                <SelectItem value="sponsorship">協賛金</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterMeeting} onValueChange={setFilterMeeting}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="例会で絞り込み" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全例会</SelectItem>
                {meetings.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Heart className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p>登録されているデータがありません</p>
              {canManage && (
                <Button size="sm" variant="outline" className="mt-4"
                  onClick={() => { resetForm(); setShowDialog(true); }}>
                  最初の登録をする
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* デスクトップ */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-gray-600">日付</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">寄付者名</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-600">種別</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-600">金額</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">理由・コメント</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">例会</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(d => (
                      <tr key={d.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-3 text-gray-600">{formatDate(d.transaction_date)}</td>
                        <td className="py-3 px-3 font-medium">{d.donor_name}</td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DONATION_TYPE_COLORS[d.donation_type]}`}>
                            {DONATION_TYPE_LABELS[d.donation_type]}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium">{formatCurrency(d.amount)}</td>
                        <td className="py-3 px-3 text-gray-500 text-xs max-w-[14rem] truncate">{d.reason ?? '—'}</td>
                        <td className="py-3 px-3 text-gray-500 text-xs">{d.meeting?.title ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* モバイル */}
              <div className="sm:hidden space-y-3">
                {filtered.map(d => (
                  <div key={d.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{d.donor_name}</p>
                        <p className="text-xs text-gray-400">{formatDate(d.transaction_date)}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DONATION_TYPE_COLORS[d.donation_type]}`}>
                        {DONATION_TYPE_LABELS[d.donation_type]}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">金額</span>
                      <span className="font-mono font-bold">{formatCurrency(d.amount)}</span>
                    </div>
                    {d.reason && <p className="text-xs text-gray-400 border-t pt-2">{d.reason}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 登録ダイアログ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-pink-500" />
              ニコニコ・寄付の登録
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label required>種別</Label>
              <Select value={form.donation_type}
                onValueChange={v => setForm(f => ({ ...f, donation_type: v as typeof form.donation_type }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="niconico">ニコニコ</SelectItem>
                  <SelectItem value="donation">寄付</SelectItem>
                  <SelectItem value="sponsorship">協賛金</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {members.length > 0 && (
              <div className="space-y-1.5">
                <Label>会員から選択（任意）</Label>
                <Select value={form.donor_user_id} onValueChange={handleMemberSelect}>
                  <SelectTrigger><SelectValue placeholder="会員を選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— 直接入力 —</SelectItem>
                    {members.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label required>寄付者名</Label>
              <Input placeholder="氏名" value={form.donor_name}
                onChange={e => setForm(f => ({ ...f, donor_name: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label required>金額（円）</Label>
              <Input type="number" placeholder="1000" min={0} step={100}
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>理由・コメント</Label>
              <Input placeholder="例：例会出席、誕生日記念など"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label required>日付</Label>
              <Input type="date" value={form.transaction_date}
                onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))} />
            </div>

            {meetings.length > 0 && (
              <div className="space-y-1.5">
                <Label>関連例会（任意）</Label>
                <Select value={form.meeting_id}
                  onValueChange={v => setForm(f => ({ ...f, meeting_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="例会を選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— 例会なし —</SelectItem>
                    {meetings.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.title}（{formatDate(m.date)}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? '登録中...' : '登録する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
