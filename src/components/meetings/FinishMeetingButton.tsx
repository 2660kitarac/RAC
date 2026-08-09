'use client';

/**
 * 例会終了ボタン（クロージング）
 *
 * 例会詳細ページ・例会一覧の両方から使えるように独立コンポーネント化。
 *
 * 挙動:
 *  1. ボタン押下 → GET /api/meetings/[id]/finish で事前チェック
 *  2. 未回答が残っている場合は終了不可（出席管理への導線を表示）
 *  3. 問題なければ確認ダイアログ → POST で終了
 *  4. 終了済みの場合は「終了を取り消す」を表示
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2, AlertTriangle, Loader2, Users, FileText,
  Printer, RotateCcw, Flag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

type Readiness = {
  totalCount: number;
  presentCount: number;
  absentCount: number;
  undecidedCount: number;
  unpaidCount: number;
  hasReport: boolean;
  canFinish: boolean;
  blockers: string[];
};

type Props = {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  status: string;
  finishedAt?: string | null;
  /** 一覧用のコンパクト表示 */
  compact?: boolean;
  /** 終了処理後に呼ばれる（一覧の楽観更新用） */
  onFinished?: () => void;
};

export default function FinishMeetingButton({
  meetingId, meetingTitle, meetingDate, status,
  finishedAt, compact = false, onFinished,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [closingNote, setClosingNote] = useState('');
  const [done, setDone] = useState(false);

  const isFinished = status === 'finished';
  const isCancelled = status === 'cancelled';

  // 例会日が未来の場合は誤操作防止のため非表示
  const todayStr = new Date().toISOString().split('T')[0];
  const isFuture = meetingDate > todayStr;

  // ---- 事前チェックしてダイアログを開く ----
  const openDialog = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/finish`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '終了状態の取得に失敗しました');
        return;
      }
      setReadiness(data);
      setClosingNote('');
      setDone(false);
      setOpen(true);
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setChecking(false);
    }
  };

  // ---- 終了実行 ----
  const handleFinish = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '終了処理に失敗しました');
        return;
      }
      toast.success('例会を終了しました');
      setDone(true);
      onFinished?.();
      router.refresh();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 終了取り消し ----
  const handleUndo = async () => {
    if (!confirm('例会の終了を取り消して「締切」状態に戻します。よろしいですか？')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/finish`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '取り消しに失敗しました');
        return;
      }
      toast.success('終了を取り消しました');
      onFinished?.();
      router.refresh();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // 中止された例会は何も表示しない
  // ============================================================
  if (isCancelled) return null;

  // ============================================================
  // 終了済み表示
  // ============================================================
  if (isFinished) {
    if (compact) {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={submitting}
          className="text-gray-500 hover:text-gray-700"
          title="終了を取り消す"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5">
          <CheckCircle2 className="h-4 w-4" />
          終了済み
          {finishedAt && (
            <span className="text-blue-500 text-xs">
              （{formatDateTime(finishedAt)}）
            </span>
          )}
        </span>
        <Button variant="ghost" size="sm" onClick={handleUndo} disabled={submitting}>
          <RotateCcw className="h-4 w-4" />
          終了を取り消す
        </Button>
      </div>
    );
  }

  // ============================================================
  // 未来の例会は終了ボタンを出さない
  // ============================================================
  if (isFuture) return null;

  return (
    <>
      <Button
        variant={compact ? 'outline' : 'default'}
        size="sm"
        onClick={openDialog}
        loading={checking}
        className={compact ? '' : 'bg-blue-600 hover:bg-blue-700 text-white'}
      >
        <Flag className="h-4 w-4" />
        {compact ? '終了' : '例会を終了する'}
      </Button>

      <Dialog open={open} onOpenChange={o => { if (!submitting) setOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {done ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  例会を終了しました
                </>
              ) : (
                <>
                  <Flag className="h-5 w-5 text-blue-600" />
                  例会を終了する
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* ---- 終了後の次アクション ---- */}
          {done && readiness && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                「{meetingTitle}」を終了しました。続けて以下の作業ができます。
              </p>
              <div className="space-y-2">
                {!readiness.hasReport && (
                  <Link href={`/meetings/${meetingId}/report`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <FileText className="h-4 w-4" />
                      報告書を作成する
                    </Button>
                  </Link>
                )}
                <Link href={`/receipts/bulk-print?meeting_id=${meetingId}`} className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Printer className="h-4 w-4" />
                    領収書をまとめて印刷する
                  </Button>
                </Link>
                {readiness.unpaidCount > 0 && (
                  <Link href={`/emails/compose?meeting_id=${meetingId}`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      未払い{readiness.unpaidCount}名に連絡する
                    </Button>
                  </Link>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>閉じる</Button>
              </DialogFooter>
            </div>
          )}

          {/* ---- 終了前の確認 ---- */}
          {!done && readiness && (
            <div className="space-y-4">
              <div className="text-sm">
                <p className="font-medium text-gray-900">{meetingTitle}</p>
                <p className="text-gray-500 text-xs mt-0.5">{meetingDate}</p>
              </div>

              {/* 集計サマリー */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <SummaryBox label="登録者" value={readiness.totalCount} />
                <SummaryBox label="出席" value={readiness.presentCount} tone="green" />
                <SummaryBox label="欠席" value={readiness.absentCount} tone="gray" />
              </div>

              {/* 未回答が残っている → 終了不可 */}
              {readiness.undecidedCount > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm text-red-800">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">
                        未回答が{readiness.undecidedCount}名います
                      </p>
                      <p className="text-red-700 text-xs mt-1">
                        全員の出席／欠席を確定してから例会を終了してください。
                        出席管理画面で一括変更できます。
                      </p>
                    </div>
                  </div>
                  <Link href={`/meetings/${meetingId}/attendances`} className="block">
                    <Button variant="outline" size="sm" className="w-full">
                      <Users className="h-4 w-4" />
                      出席管理で確定する
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  {/* 未払い警告（ブロックはしない） */}
                  {readiness.unpaidCount > 0 && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">未払いが{readiness.unpaidCount}名います</p>
                        <p className="text-amber-700 text-xs mt-0.5">
                          終了後も出席管理から支払い記録は可能です。
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 終了時の挙動説明 */}
                  <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
                    <p className="font-medium text-gray-700">終了すると:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>ステータスが「終了」になります</li>
                      <li>MU登録の受付が締め切られます</li>
                      <li>「次回例会」「当日受付」の一覧から外れます</li>
                    </ul>
                    <p className="text-gray-500 pt-1">
                      ※ 会計への計上は行いません（会計管理から手動で登録してください）
                    </p>
                  </div>

                  {/* 終了メモ */}
                  <div>
                    <label htmlFor="closing-note" className="block text-sm font-medium text-gray-700 mb-1">
                      終了メモ（任意）
                    </label>
                    <textarea
                      id="closing-note"
                      value={closingNote}
                      onChange={e => setClosingNote(e.target.value)}
                      rows={3}
                      placeholder="振り返り・特記事項があれば記録できます"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                  キャンセル
                </Button>
                <Button
                  onClick={handleFinish}
                  disabled={submitting || readiness.undecidedCount > 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      処理中...
                    </>
                  ) : (
                    <>
                      <Flag className="h-4 w-4" />
                      例会を終了する
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryBox({
  label, value, tone = 'blue',
}: { label: string; value: number; tone?: 'blue' | 'green' | 'gray' }) {
  const tones = {
    blue:  'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    gray:  'bg-gray-50 border-gray-200 text-gray-600',
  };
  return (
    <div className={`rounded-md border px-2 py-2 ${tones[tone]}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}
