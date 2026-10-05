'use client';

/**
 * クラブ報告書の審査画面（地区役員用）
 *  - 状態タブ（審査待ち／差し戻し／承認済み／すべて）＋クラブ絞り込み
 *  - 行をクリックすると詳細ダイアログ（本文・履歴・承認／差し戻し／やり直し）
 *  - クラブ別の提出状況
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronRight, FileText, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  LIMITS, REPORT_STATUS_LABELS, REPORT_TYPE_LABELS, fmtDate, fmtDateTime, meetingLabel,
} from '@/lib/district/submissions';
import { CountTabs, StatusPill, sendPatch } from './shared';

export type ReviewReport = {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  reportType: string;
  status: string;
  content: string | null;
  meetingTitle: string | null;
  meetingDate: string | null;
  meetingNumber: number | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  submitterName: string | null;
  reviewerName: string | null;
  updatedAt: string;
};

export type ReviewClub = { id: string; name: string };

type TabKey = 'submitted' | 'rejected' | 'approved' | 'all';

export function ReportReview({ reports, clubs }: { reports: ReviewReport[]; clubs: ReviewClub[] }) {
  const [tab, setTab] = useState<TabKey>('submitted');
  const [clubId, setClubId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const byClub = useMemo(() => (clubId ? reports.filter((r) => r.clubId === clubId) : reports), [reports, clubId]);
  const count = (s: string) => byClub.filter((r) => r.status === s).length;
  const shown = tab === 'all' ? byClub : byClub.filter((r) => r.status === tab);
  const opened = openId ? reports.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CountTabs<TabKey>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'submitted', label: '審査待ち', count: count('submitted'), highlight: true },
              { key: 'rejected', label: '差し戻し', count: count('rejected') },
              { key: 'approved', label: '承認済み', count: count('approved') },
              { key: 'all', label: 'すべて', count: byClub.length },
            ]}
          />
          <div className="flex items-center gap-2">
            <Label htmlFor="report-club-filter" className="whitespace-nowrap text-sm text-gray-600">クラブ</Label>
            <select
              id="report-club-filter"
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm md:w-56"
            >
              <option value="">すべてのクラブ</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
            <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            {tab === 'submitted'
              ? '審査待ちの報告書はありません。クラブから提出されるとここに表示されます。'
              : '該当する報告書はありません。'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="rac-table w-full text-sm">
              <thead className="border-b bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">クラブ</th>
                  <th className="px-4 py-3 font-medium">タイトル</th>
                  <th className="px-4 py-3 font-medium">種類</th>
                  <th className="px-4 py-3 font-medium">関連する例会</th>
                  <th className="px-4 py-3 font-medium">提出日</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b hover:bg-indigo-50/40"
                    onClick={() => setOpenId(r.id)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900" data-cell="primary">{r.clubName}</td>
                    <td className="px-4 py-3" data-label="タイトル">{r.title}</td>
                    <td className="px-4 py-3 text-gray-600" data-label="種類">{REPORT_TYPE_LABELS[r.reportType] ?? r.reportType}</td>
                    <td className="px-4 py-3 text-gray-600" data-label="関連する例会">
                      {meetingLabel({ date: r.meetingDate, title: r.meetingTitle, meetingNumber: r.meetingNumber }) || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600" data-label="提出日">{fmtDate(r.submittedAt) || '—'}</td>
                    <td className="px-4 py-3" data-label="状態">
                      <StatusPill status={r.status} labels={REPORT_STATUS_LABELS} />
                    </td>
                    <td className="px-4 py-3 text-right" data-cell="actions">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}
                      >
                        {r.status === 'submitted' ? '審査する' : '詳細'}
                        <ChevronRight />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ClubSummary reports={reports} clubs={clubs} />

      <ReportDialog report={opened} onClose={() => setOpenId(null)} />
    </div>
  );
}

/** クラブ別の提出状況（0件のクラブも表示） */
function ClubSummary({ reports, clubs }: { reports: ReviewReport[]; clubs: ReviewClub[] }) {
  const rows = clubs.map((c) => {
    const mine = reports.filter((r) => r.clubId === c.id);
    const last = mine.reduce<string>((acc, r) => (r.submittedAt && r.submittedAt > acc ? r.submittedAt : acc), '');
    return {
      ...c,
      total: mine.length,
      approved: mine.filter((r) => r.status === 'approved').length,
      rejected: mine.filter((r) => r.status === 'rejected').length,
      waiting: mine.filter((r) => r.status === 'submitted').length,
      last,
    };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">クラブ別の提出状況</CardTitle>
        <p className="text-xs text-gray-500">まだ1件も提出していないクラブには、声をかけてみましょう。</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">地区にクラブが登録されていません。</p>
        ) : (
          <table className="rac-table w-full text-sm">
            <thead className="border-b text-left text-gray-600">
              <tr>
                <th className="py-2 pr-3 font-medium">クラブ</th>
                <th className="px-3 py-2 text-right font-medium">提出数</th>
                <th className="px-3 py-2 text-right font-medium">審査待ち</th>
                <th className="px-3 py-2 text-right font-medium">承認数</th>
                <th className="px-3 py-2 text-right font-medium">差し戻し数</th>
                <th className="px-3 py-2 font-medium">最終提出日</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium text-gray-900" data-cell="primary">{c.name}</td>
                  <td className="px-3 py-2 text-right" data-label="提出数">
                    {c.total === 0 ? <span className="text-red-600">0</span> : c.total}
                  </td>
                  <td className="px-3 py-2 text-right" data-label="審査待ち">{c.waiting}</td>
                  <td className="px-3 py-2 text-right" data-label="承認数">{c.approved}</td>
                  <td className="px-3 py-2 text-right" data-label="差し戻し数">{c.rejected}</td>
                  <td className="px-3 py-2 text-gray-600" data-label="最終提出日">{fmtDate(c.last) || 'まだありません'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/** 報告書の詳細と審査操作 */
function ReportDialog({ report, onClose }: { report: ReviewReport | null; onClose: () => void }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setRejecting(false);
    setReason('');
    onClose();
  };

  const act = async (action: 'approve' | 'reject' | 'reopen') => {
    if (!report) return;
    if (action === 'reject' && !reason.trim()) return;
    if (action === 'reopen' && !window.confirm('この報告書を「審査待ち」に戻します。よろしいですか？')) return;
    setBusy(true);
    const ok = await sendPatch(
      `/api/district/reports/${encodeURIComponent(report.id)}`,
      { action, reason: action === 'reject' ? reason : undefined },
      action === 'approve' ? '承認しました' : action === 'reject' ? '差し戻しました' : '審査待ちに戻しました',
    );
    setBusy(false);
    if (ok) {
      setRejecting(false);
      setReason('');
      router.refresh();
    }
  };

  return (
    <Dialog open={!!report} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-2xl">
        {report && (
          <>
            <DialogHeader className="pr-8 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={report.status} labels={REPORT_STATUS_LABELS} />
                <span className="text-xs text-gray-500">{REPORT_TYPE_LABELS[report.reportType] ?? report.reportType}</span>
              </div>
              <DialogTitle className="leading-snug">{report.title}</DialogTitle>
              <DialogDescription>{report.clubName}</DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-gray-500">関連する例会</dt>
              <dd className="min-w-0 break-words">
                {meetingLabel({ date: report.meetingDate, title: report.meetingTitle, meetingNumber: report.meetingNumber }) || 'なし'}
              </dd>
              <dt className="text-gray-500">提出者</dt>
              <dd>{report.submitterName ?? '—'}</dd>
              <dt className="text-gray-500">提出日時</dt>
              <dd>{fmtDateTime(report.submittedAt) || '—'}</dd>
              {report.approvedAt && (
                <>
                  <dt className="text-gray-500">承認日時</dt>
                  <dd>{fmtDateTime(report.approvedAt)}</dd>
                </>
              )}
              {report.rejectedAt && (
                <>
                  <dt className="text-gray-500">差し戻し日時</dt>
                  <dd>{fmtDateTime(report.rejectedAt)}</dd>
                </>
              )}
              {report.reviewerName && (
                <>
                  <dt className="text-gray-500">審査した人</dt>
                  <dd>{report.reviewerName}</dd>
                </>
              )}
            </dl>

            {report.status === 'rejected' && report.rejectionReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                <p className="mb-1 font-semibold text-red-700">差し戻し理由（クラブに表示されています）</p>
                <p className="whitespace-pre-wrap break-words text-red-800">{report.rejectionReason}</p>
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-semibold text-gray-700">内容</p>
              <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-gray-50 p-3 text-sm leading-relaxed text-gray-800">
                {report.content?.trim() ? report.content : <span className="text-gray-400">（本文がありません）</span>}
              </div>
            </div>

            {report.status === 'submitted' && !rejecting && (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                  <Undo2 />差し戻す
                </Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => act('approve')} loading={busy}>
                  <CheckCircle2 />承認する
                </Button>
              </div>
            )}

            {report.status === 'submitted' && rejecting && (
              <div className="space-y-2 rounded-lg border border-red-200 p-3">
                <Label htmlFor="reject-reason">差し戻しの理由（クラブに表示されます）</Label>
                <Textarea
                  id="reject-reason"
                  rows={4}
                  maxLength={LIMITS.reason}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例：参加人数の記載が抜けています。追記して再提出してください。"
                />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={() => { setRejecting(false); setReason(''); }} disabled={busy}>
                    やめる
                  </Button>
                  <Button variant="destructive" onClick={() => act('reject')} loading={busy} disabled={!reason.trim()}>
                    差し戻す
                  </Button>
                </div>
              </div>
            )}

            {(report.status === 'approved' || report.status === 'rejected') && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => act('reopen')} loading={busy}>
                  <RotateCcw />審査をやり直す
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
