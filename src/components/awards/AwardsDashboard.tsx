'use client';

import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { UserRole } from '@/types';
import { canManageAwards } from '@/lib/hooks/useAuth';
import { Award, Save, Download } from 'lucide-react';

interface Club { id: string; name: string; short_name: string | null; }
interface ScoreItem {
  id: string; code: string; name: string;
  max_score: number | null; calculation_type: string; description: string | null;
}
interface AwardScore {
  id: string; club_id: string; score_item_code: string;
  score: number; evidence_status: string;
}

interface AwardsDashboardProps {
  clubs: Club[];
  scoreItems: ScoreItem[];
  scores: AwardScore[];
  districtId: string;
  currentYear: number;
  userRole: UserRole;
}

const EVIDENCE_STATUS_LABELS: Record<string, string> = {
  pending: '未提出', submitted: '提出済', reviewing: '審査中',
  approved: '承認', rejected: '却下', not_applicable: '対象外',
};
const EVIDENCE_STATUS_COLORS: Record<string, string> = {
  pending: 'text-gray-400', submitted: 'text-blue-600', reviewing: 'text-yellow-600',
  approved: 'text-green-600', rejected: 'text-red-600', not_applicable: 'text-gray-300',
};

export default function AwardsDashboard({
  clubs, scoreItems, scores: initialScores,
  districtId, currentYear, userRole,
}: AwardsDashboardProps) {
  const canManage = canManageAwards(userRole);

  const [scores, setScores] = useState<AwardScore[]>(initialScores);
  const [editDialog, setEditDialog] = useState<{ open: boolean; clubId: string; itemCode: string; score: number; status: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // club_id + score_item_code でスコアを取得
  const getScore = (clubId: string, itemCode: string): AwardScore | undefined =>
    scores.find(s => s.club_id === clubId && s.score_item_code === itemCode);

  // クラブ別合計スコア
  const getClubTotal = (clubId: string) =>
    scores.filter(s => s.club_id === clubId).reduce((sum, s) => sum + s.score, 0);

  // 合計スコアでランキング
  const rankedClubs = [...clubs]
    .map(c => ({ club: c, total: getClubTotal(c.id) }))
    .sort((a, b) => b.total - a.total);

  const openEdit = (clubId: string, item: ScoreItem) => {
    const existing = getScore(clubId, item.code);
    setEditDialog({
      open: true,
      clubId,
      itemCode: item.code,
      score: existing?.score ?? 0,
      status: existing?.evidence_status ?? 'pending',
    });
  };

  const handleScoreUpdate = async () => {
    if (!editDialog) return;
    setLoading(true);
    try {
      const response = await fetch('/api/awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          districtId,
          fiscalYear: currentYear,
          clubId: editDialog.clubId,
          scoreItemCode: editDialog.itemCode,
          score: editDialog.score,
          evidenceStatus: editDialog.status,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '更新に失敗しました');

      // ローカル状態更新
      const existing = getScore(editDialog.clubId, editDialog.itemCode);
      if (existing) {
        setScores(prev => prev.map(s =>
          s.id === existing.id
            ? { ...s, score: editDialog.score, evidence_status: editDialog.status }
            : s
        ));
      } else if (data.id) {
        setScores(prev => [...prev, {
          id: data.id,
          club_id: editDialog.clubId,
          score_item_code: editDialog.itemCode,
          score: editDialog.score,
          evidence_status: editDialog.status,
        }]);
      }
      toast.success('スコアを更新しました');
      setEditDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // CSV出力
  const handleCsvExport = () => {
    const BOM = '\uFEFF';
    const headers = ['クラブ名', '合計', ...scoreItems.map(i => i.name)];
    const rows = rankedClubs.map(({ club, total }) => [
      club.name, total,
      ...scoreItems.map(item => getScore(club.id, item.code)?.score ?? 0),
    ]);
    const csv = BOM + [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `表彰スコア_${currentYear}年度.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSVを出力しました');
  };

  if (scoreItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Award className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-gray-500 mb-2">表彰項目が設定されていません</p>
          <p className="text-sm text-gray-400">
            「表彰設定」ページから点数項目を設定してください
          </p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <a href="/awards/settings">表彰設定へ</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ランキングカード */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rankedClubs.slice(0, 3).map(({ club, total }, idx) => (
          <Card key={club.id} className={idx === 0 ? 'border-yellow-300 bg-yellow-50' : idx === 1 ? 'border-gray-300 bg-gray-50' : 'border-amber-300 bg-amber-50'}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-2xl font-black ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : 'text-amber-600'}`}>
                  {idx + 1}位
                </span>
              </div>
              <p className="font-bold text-gray-900">{club.short_name ?? club.name}</p>
              <p className="text-2xl font-bold text-gray-700 mt-1">{total}点</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* スコア一覧テーブル */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4" />
              クラブ別スコア一覧
            </CardTitle>
            <Button size="sm" variant="outline" onClick={handleCsvExport}>
              <Download className="h-4 w-4 mr-1" />CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium text-gray-600 sticky left-0 bg-white min-w-[8rem]">クラブ</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-600 min-w-[4rem]">合計</th>
                  {scoreItems.map(item => (
                    <th key={item.code} className="text-center py-2 px-1 font-medium text-gray-600 min-w-[5rem]" title={item.description ?? ''}>
                      <div>{item.name}</div>
                      {item.max_score && <div className="text-gray-400 font-normal">/{item.max_score}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankedClubs.map(({ club, total }, rank) => (
                  <tr key={club.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2 sticky left-0 bg-white">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${rank === 0 ? 'text-yellow-500' : rank === 1 ? 'text-gray-400' : rank === 2 ? 'text-amber-600' : 'text-gray-300'}`}>
                          {rank + 1}
                        </span>
                        <span className="font-medium truncate max-w-[7rem]">{club.short_name ?? club.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center font-bold text-gray-800">{total}</td>
                    {scoreItems.map(item => {
                      const s = getScore(club.id, item.code);
                      return (
                        <td key={item.code} className="py-2 px-1 text-center">
                          <button
                            onClick={() => canManage && openEdit(club.id, item)}
                            className={`w-full rounded px-1 py-0.5 text-center transition-colors ${canManage ? 'hover:bg-blue-50 cursor-pointer' : 'cursor-default'}`}
                          >
                            <div className="font-medium">{s?.score ?? 0}</div>
                            {s && (
                              <div className={`text-[10px] ${EVIDENCE_STATUS_COLORS[s.evidence_status]}`}>
                                {EVIDENCE_STATUS_LABELS[s.evidence_status]}
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage && (
            <p className="text-xs text-gray-400 mt-3">セルをクリックしてスコアを入力できます</p>
          )}
        </CardContent>
      </Card>

      {/* スコア編集ダイアログ */}
      {editDialog && (
        <Dialog open={editDialog.open} onOpenChange={() => setEditDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>スコアを入力</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-medium">{clubs.find(c => c.id === editDialog.clubId)?.name}</p>
                <p className="text-gray-500">{scoreItems.find(i => i.code === editDialog.itemCode)?.name}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">スコア</label>
                <Input type="number" min={0}
                  max={scoreItems.find(i => i.code === editDialog.itemCode)?.max_score ?? 999}
                  value={editDialog.score}
                  onChange={e => setEditDialog(d => d ? { ...d, score: Number(e.target.value) } : d)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">証跡ステータス</label>
                <Select value={editDialog.status}
                  onValueChange={v => setEditDialog(d => d ? { ...d, status: v } : d)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EVIDENCE_STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialog(null)}>キャンセル</Button>
              <Button onClick={handleScoreUpdate} loading={loading}>
                <Save className="h-4 w-4 mr-1" />
                保存する
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
