'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate, formatCurrency } from '@/lib/utils';
import {
  CheckCircle2, Trash2, Loader2, ChevronDown, ChevronUp,
  Users, Download, Filter
} from 'lucide-react';

interface MuVisitRow {
  id: string;
  userId: string;
  userName: string | null;
  visitedClubName: string;
  visitDate: string;
  feeAmount: number;
  note: string | null;
  settlementStatus: string;
  settledAt: string | null;
  createdAt: string;
}

interface Props {
  visits: MuVisitRow[];
  isPersonalBurden: boolean;
}

export default function MuVisitsTable({ visits, isPersonalBurden }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [settlingAll, setSettlingAll] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // 年度フィルター
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const ys = new Set(visits.map(v => v.visitDate.slice(0, 4)));
    ys.add(String(currentYear));
    return Array.from(ys).sort((a, b) => Number(b) - Number(a));
  }, [visits, currentYear]);
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // フィルター済みデータ
  const filteredVisits = useMemo(() => {
    return visits.filter(v => {
      const yearMatch = yearFilter === 'all' || v.visitDate.startsWith(yearFilter);
      const statusMatch = statusFilter === 'all' || v.settlementStatus === statusFilter;
      return yearMatch && statusMatch;
    });
  }, [visits, yearFilter, statusFilter]);

  // ユーザーごとに集計（フィルター後）
  const userMap = useMemo(() => {
    const map = new Map<string, { name: string; visits: MuVisitRow[]; totalFee: number; pendingFee: number }>();
    for (const v of filteredVisits) {
      const key = v.userId;
      if (!map.has(key)) {
        map.set(key, { name: v.userName || '不明', visits: [], totalFee: 0, pendingFee: 0 });
      }
      const u = map.get(key)!;
      u.visits.push(v);
      u.totalFee += v.feeAmount;
      if (v.settlementStatus === 'pending') u.pendingFee += v.feeAmount;
    }
    return map;
  }, [filteredVisits]);

  const pendingVisits = filteredVisits.filter(v => v.settlementStatus === 'pending');
  const totalPendingFee = pendingVisits.reduce((s, v) => s + v.feeAmount, 0);

  async function handleSettle(id: string) {
    setLoadingId(id);
    try {
      await fetch(`/api/mu-visits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlementStatus: 'settled' }),
      });
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('この報告を削除しますか？')) return;
    setLoadingId(id);
    try {
      await fetch(`/api/mu-visits/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  async function handleSettleAll() {
    if (pendingVisits.length === 0) return;
    if (!confirm(`未精算 ${pendingVisits.length}件（${formatCurrency(totalPendingFee)}）を一括精算済みにしますか？`)) return;
    setSettlingAll(true);
    try {
      await Promise.all(
        pendingVisits.map(v =>
          fetch(`/api/mu-visits/${v.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settlementStatus: 'settled' }),
          })
        )
      );
      router.refresh();
    } finally {
      setSettlingAll(false);
    }
  }

  // CSVエクスポート
  function handleExportCsv() {
    const header = ['会員名', '訪問先クラブ', '訪問日', 'MU費', '精算状況', 'メモ'];
    const statusLabel = (s: string) => {
      if (s === 'settled') return '精算済';
      if (s === 'personal') return '個人負担';
      return '未精算';
    };
    const rows = filteredVisits.map(v => [
      v.userName || '不明',
      v.visitedClubName,
      v.visitDate,
      String(v.feeAmount),
      statusLabel(v.settlementStatus),
      v.note || '',
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const yearLabel = yearFilter === 'all' ? '全期間' : yearFilter;
    a.download = `MU訪問記録_${yearLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusBadge = (s: string) => {
    if (s === 'settled') return { label: '精算済', cls: 'bg-green-100 text-green-700' };
    if (s === 'personal') return { label: '個人負担', cls: 'bg-blue-100 text-blue-700' };
    return { label: '未精算', cls: 'bg-yellow-100 text-yellow-700' };
  };

  return (
    <div className="space-y-4">
      {/* フィルター＆エクスポートバー */}
      <div className="bg-white rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />

        {/* 年度フィルター */}
        <select
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">全期間</option>
          {years.map(y => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>

        {/* 精算状況フィルター */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">すべての状況</option>
          {!isPersonalBurden && <option value="pending">未精算のみ</option>}
          {!isPersonalBurden && <option value="settled">精算済のみ</option>}
          {isPersonalBurden && <option value="personal">個人負担のみ</option>}
        </select>

        <div className="flex-1" />

        {/* CSVエクスポートボタン */}
        <button
          onClick={handleExportCsv}
          disabled={filteredVisits.length === 0}
          className="flex items-center gap-2 bg-gray-100 text-gray-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-200 disabled:opacity-40 transition-colors"
        >
          <Download className="h-4 w-4" />
          CSV出力
          {filteredVisits.length > 0 && (
            <span className="text-xs text-gray-500">({filteredVisits.length}件)</span>
          )}
        </button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-xs text-gray-500">総訪問件数</p>
          <p className="text-2xl font-bold text-gray-800">{filteredVisits.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-xs text-gray-500">参加会員数</p>
          <p className="text-2xl font-bold text-purple-700">{userMap.size}</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-xs text-gray-500">総MU費</p>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(filteredVisits.reduce((s, v) => s + v.feeAmount, 0))}</p>
        </div>
        {!isPersonalBurden && (
          <div className="bg-white rounded-xl border p-3 text-center">
            <p className="text-xs text-gray-500">未精算合計</p>
            <p className="text-2xl font-bold text-yellow-600">{formatCurrency(totalPendingFee)}</p>
          </div>
        )}
      </div>

      {/* 一括精算ボタン（クラブ負担の場合のみ） */}
      {!isPersonalBurden && pendingVisits.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleSettleAll}
            disabled={settlingAll}
            className="flex items-center gap-2 bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {settlingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            未精算 {pendingVisits.length}件を一括精算（{formatCurrency(totalPendingFee)}）
          </button>
        </div>
      )}

      {/* 件数ゼロ時 */}
      {filteredVisits.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {visits.length === 0 ? 'MU訪問報告はまだありません' : '条件に一致する記録がありません'}
          </p>
        </div>
      ) : (
        /* 会員ごとアコーディオン */
        <div className="space-y-2">
          {Array.from(userMap.entries()).map(([userId, u]) => (
            <div key={userId} className="bg-white rounded-xl border overflow-hidden">
              {/* 会員ヘッダー */}
              <button
                type="button"
                onClick={() => setExpandedUser(prev => prev === userId ? null : userId)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-purple-700">{u.name.slice(0, 1)}</span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.visits.length}回訪問</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-mono text-gray-800">{formatCurrency(u.totalFee)}</p>
                    {!isPersonalBurden && u.pendingFee > 0 && (
                      <p className="text-xs text-yellow-600">未精算: {formatCurrency(u.pendingFee)}</p>
                    )}
                  </div>
                  {expandedUser === userId ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </button>

              {/* 訪問詳細リスト */}
              {expandedUser === userId && (
                <div className="border-t divide-y">
                  {u.visits.map((v) => {
                    const { label, cls } = statusBadge(v.settlementStatus);
                    const isLoading = loadingId === v.id;
                    return (
                      <div key={v.id} className="px-4 py-3 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{v.visitedClubName}</p>
                          <p className="text-xs text-gray-500">{formatDate(v.visitDate)}</p>
                          {v.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{v.note}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <p className="text-sm font-mono text-gray-800">{formatCurrency(v.feeAmount)}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
                            {label}
                          </span>
                          {/* 精算ボタン（クラブ負担＋未精算のみ） */}
                          {!isPersonalBurden && v.settlementStatus === 'pending' && (
                            <button
                              onClick={() => handleSettle(v.id)}
                              disabled={isLoading}
                              className="p-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
                              title="精算済みにする"
                            >
                              {isLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          {/* 削除ボタン */}
                          <button
                            onClick={() => handleDelete(v.id)}
                            disabled={isLoading}
                            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                            title="削除"
                          >
                            {isLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
