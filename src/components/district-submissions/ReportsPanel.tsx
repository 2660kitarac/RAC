'use client';

/**
 * 地区への提出 — 報告書タブ（クラブ側）
 *  - 自クラブの報告書一覧（差し戻し理由を目立たせる）
 *  - 作成・編集ダイアログ（下書き保存／地区へ提出、例会報告書から読み込み）
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, ChevronUp, Download, FileText, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  LIMITS, REPORT_STATUS_LABELS, REPORT_TYPES, REPORT_TYPE_LABELS, fmtDate, fmtDateTime, meetingLabel,
} from '@/lib/district/submissions';
import { MeetingSelect, StatusPill, callApi, selectClass, type ClubReportItem, type MeetingOption } from './shared';

export function ReportsPanel({
  reports, meetings, canSubmit,
}: {
  reports: ClubReportItem[];
  meetings: MeetingOption[];
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ClubReportItem | 'new' | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = async (r: ClubReportItem) => {
    if (!window.confirm(`下書き「${r.title}」を削除します。よろしいですか？`)) return;
    setBusyId(r.id);
    const ok = await callApi(`/api/club/district-submissions/${encodeURIComponent(r.id)}?kind=report`, { method: 'DELETE' }, '削除しました');
    setBusyId(null);
    if (ok) router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          例会や活動の報告書を地区に提出します。「下書き」はクラブ内だけで保存され、地区には見えません。
        </p>
        <Button onClick={() => setEditing('new')} disabled={!canSubmit} className="shrink-0">
          <Plus />新しい報告書
        </Button>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
          <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          まだ報告書はありません。「新しい報告書」から作成して、地区へ提出しましょう。
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const editable = r.status === 'draft' || r.status === 'rejected';
            const open = expanded === r.id;
            const meeting = meetingLabel({ date: r.meetingDate, title: r.meetingTitle, meetingNumber: r.meetingNumber });
            return (
              <Card key={r.id} className={r.status === 'rejected' ? 'border-red-300' : undefined}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={r.status} labels={REPORT_STATUS_LABELS} />
                        <span className="text-xs text-gray-500">{REPORT_TYPE_LABELS[r.reportType] ?? r.reportType}</span>
                      </div>
                      <p className="mt-1 break-words font-semibold text-gray-900">{r.title}</p>
                      {meeting && <p className="text-xs text-gray-500">例会：{meeting}</p>}
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      {r.submittedAt ? <p>提出 {fmtDate(r.submittedAt)}</p> : <p>更新 {fmtDate(r.updatedAt)}</p>}
                      {r.status === 'approved' && r.approvedAt && <p className="text-green-700">承認 {fmtDate(r.approvedAt)}</p>}
                    </div>
                  </div>

                  {r.rejectionReason && (r.status === 'rejected' || r.status === 'draft') && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                      <p className="mb-1 flex items-center gap-1 font-semibold text-red-700">
                        <AlertTriangle className="h-4 w-4" />
                        {r.status === 'rejected' ? '地区から差し戻されました' : '前回の差し戻し理由'}
                        {r.rejectedAt && <span className="font-normal text-red-600">（{fmtDateTime(r.rejectedAt)}）</span>}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-red-800">{r.rejectionReason}</p>
                      {r.status === 'rejected' && <p className="mt-1 text-xs text-red-600">内容を直して、もう一度提出してください。</p>}
                    </div>
                  )}

                  {r.status === 'submitted' && (
                    <p className="text-xs text-gray-500">地区で確認中です。提出後は編集できません。</p>
                  )}

                  {open && (
                    <div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-gray-50 p-3 text-sm text-gray-800">
                      {r.content?.trim() ? r.content : <span className="text-gray-400">（本文がありません）</span>}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : r.id)}>
                      {open ? <ChevronUp /> : <ChevronDown />}
                      {open ? '内容を閉じる' : '内容を見る'}
                    </Button>
                    {r.status === 'draft' && (
                      <Button size="sm" variant="outline" onClick={() => remove(r)} loading={busyId === r.id}>
                        <Trash2 />削除
                      </Button>
                    )}
                    {editable && (
                      <Button size="sm" onClick={() => setEditing(r)} disabled={!canSubmit}>
                        <Pencil />{r.status === 'rejected' ? '直して再提出' : '編集'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <ReportFormDialog
          key={editing === 'new' ? 'new' : editing.id}
          report={editing === 'new' ? null : editing}
          meetings={meetings}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

/** 報告書の作成・編集ダイアログ */
function ReportFormDialog({
  report, meetings, onClose, onSaved,
}: {
  report: ClubReportItem | null;
  meetings: MeetingOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reportType, setReportType] = useState(report?.reportType ?? 'meeting');
  const [meetingId, setMeetingId] = useState(report?.meetingId ?? '');
  const [title, setTitle] = useState(report?.title ?? '');
  const [content, setContent] = useState(report?.content ?? '');
  const [busy, setBusy] = useState<'draft' | 'submit' | 'load' | null>(null);

  // 編集中の報告書が古い例会（選択肢の範囲外）に紐づいている場合も表示できるようにする
  const options: MeetingOption[] =
    report?.meetingId && !meetings.some((m) => m.id === report.meetingId)
      ? [{ id: report.meetingId, title: report.meetingTitle ?? '', date: report.meetingDate ?? '', meetingNumber: report.meetingNumber, hasReport: false }, ...meetings]
      : meetings;
  const selected = options.find((m) => m.id === meetingId);

  const loadFromMeetingReport = async () => {
    if (!meetingId) return;
    if (content.trim() && !window.confirm('いま入力している内容を、例会報告書の内容で置き換えます。よろしいですか？')) return;
    setBusy('load');
    const data = await callApi<{ title: string; content: string }>(
      `/api/club/district-submissions?meetingReport=${encodeURIComponent(meetingId)}`,
      { method: 'GET' },
    );
    setBusy(null);
    if (!data) return;
    if (!data.content) {
      toast.error('例会報告書に本文がありません');
      return;
    }
    setContent(data.content.slice(0, LIMITS.content));
    if (!title.trim()) setTitle(data.title.slice(0, LIMITS.title));
    toast.success('例会報告書の内容を読み込みました');
  };

  const save = async (submit: boolean) => {
    if (!title.trim()) { toast.error('タイトルを入力してください'); return; }
    if (submit && !content.trim()) { toast.error('地区へ提出するには内容を入力してください'); return; }
    if (submit && !window.confirm('地区へ提出します。提出後は、差し戻されるまで編集できません。よろしいですか？')) return;
    setBusy(submit ? 'submit' : 'draft');
    const body = { kind: 'report', reportType, meetingId: meetingId || null, title, content, submit };
    const res = report
      ? await callApi(`/api/club/district-submissions/${encodeURIComponent(report.id)}`, { method: 'PUT', body }, submit ? '地区へ提出しました' : '下書きを保存しました')
      : await callApi('/api/club/district-submissions', { method: 'POST', body }, submit ? '地区へ提出しました' : '下書きを保存しました');
    setBusy(null);
    if (res) onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{report ? (report.status === 'rejected' ? '報告書を直して再提出' : '報告書を編集') : '新しい報告書'}</DialogTitle>
          <DialogDescription>「下書き保存」はクラブ内だけに保存されます。「地区へ提出」で地区の担当者に届きます。</DialogDescription>
        </DialogHeader>

        {report?.status === 'rejected' && report.rejectionReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-semibold text-red-700">差し戻し理由</p>
            <p className="whitespace-pre-wrap break-words text-red-800">{report.rejectionReason}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rf-type">種類</Label>
              <select id="rf-type" value={reportType} onChange={(e) => setReportType(e.target.value)} className={selectClass}>
                {REPORT_TYPES.map((t) => (
                  <option key={t} value={t}>{REPORT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-meeting">関連する例会（任意）</Label>
              <MeetingSelect id="rf-meeting" value={meetingId} onChange={setMeetingId} meetings={options} showReportMark />
            </div>
          </div>

          {selected?.hasReport && (
            <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
              <span>この例会には例会報告書があります。内容をそのまま使えます。</span>
              <Button size="sm" variant="outline" onClick={loadFromMeetingReport} loading={busy === 'load'} disabled={!!busy && busy !== 'load'}>
                <Download />例会報告書から読み込む
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rf-title">タイトル</Label>
            <Input
              id="rf-title"
              value={title}
              maxLength={LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：10月第1例会 報告書"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rf-content">内容</Label>
            <Textarea
              id="rf-content"
              rows={12}
              maxLength={LIMITS.content}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'例：\n・日時、場所\n・参加人数（会員〇名、ゲスト〇名）\n・内容と感想'}
            />
            <p className="text-right text-xs text-gray-400">{content.length.toLocaleString()} / {LIMITS.content.toLocaleString()}文字</p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>キャンセル</Button>
          <Button variant="outline" onClick={() => save(false)} loading={busy === 'draft'} disabled={!!busy && busy !== 'draft'}>
            下書き保存
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => save(true)} loading={busy === 'submit'} disabled={!!busy && busy !== 'submit'}>
            <Send />地区へ提出
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
