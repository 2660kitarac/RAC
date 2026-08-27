'use client';

import { useState, useRef, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  X, Upload, FileSpreadsheet, Download, AlertTriangle, CheckCircle2,
  Loader2, ArrowLeft, Copy, Info, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const PARTICIPATION_LABELS: Record<string, string> = {
  meeting_only: '例会のみ',
  meeting_and_party: '例会＋懇親会',
  party_only: '懇親会のみ',
  absent: '欠席',
};

const MEMBER_TYPE_LABELS: Record<string, string> = {
  RAC: 'RAC',
  RC: 'RC',
  OB_OG: 'OB/OG',
  GUEST: 'ゲスト',
};

type RowAction = 'skip' | 'overwrite' | 'insert';

interface PreviewRow {
  rowNumber: number;
  name: string;
  nameKey: string;
  clubName: string | null;
  gender: string | null;
  position: string | null;
  participationType: string;
  memberType: string;
  mealRequired: boolean;
  note: string | null;
  errors: string[];
  warnings: string[];
  duplicate: 'none' | 'existing_attendance' | 'duplicate_in_file';
  duplicateOf?: {
    attendanceId?: string;
    displayName: string;
    clubName: string | null;
    participationType: string | null;
    conflicting?: boolean;
    rowNumber?: number;
  };
  matchedUserId?: string | null;
  matchedClubId?: string | null;
  isOwnClub?: boolean;
  feeAmount: number;
  afterPartyFeeAmount: number;
}

interface PreviewResponse {
  meeting: { id: string; title: string; date: string; hasAfterParty: boolean };
  file: { name: string; sheetName: string | null; headerRowNumber: number; skippedEmpty: number };
  warnings: string[];
  rows: PreviewRow[];
  summary: {
    total: number; importable: number; duplicateExisting: number;
    duplicateInFile: number; errorRows: number; warningRows: number;
  };
  existingCount: number;
}

interface Props {
  meetingId: string;
  meetingTitle: string;
  onClose: () => void;
  onImported: () => void;
}

export default function SpreadsheetImportModal({
  meetingId, meetingTitle, onClose, onImported,
}: Props) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [actions, setActions] = useState<Record<number, RowAction>>({});
  const [result, setResult] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- ひな型ダウンロード ----
  const downloadTemplate = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings/import-template');
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'ひな型のダウンロードに失敗しました');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '例会出席取り込みひな型.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('ひな型をダウンロードしました');
    } catch {
      toast.error('ひな型のダウンロードに失敗しました');
    }
  }, []);

  // ---- ファイル解析 ----
  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/meetings/${meetingId}/import/preview`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'ファイルの解析に失敗しました');
        return;
      }
      setPreview(data);
      // 既定のアクション: 重複はスキップ、それ以外は追加
      const init: Record<number, RowAction> = {};
      (data.rows as PreviewRow[]).forEach(r => {
        init[r.rowNumber] = r.duplicate === 'none' ? 'insert' : 'skip';
      });
      setActions(init);
      setStep('preview');
      if (data.warnings?.length) {
        data.warnings.forEach((w: string) => toast.warning(w));
      }
    } catch {
      toast.error('ファイルの解析に失敗しました');
    } finally {
      setUploading(false);
    }
  }, [meetingId]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  // ---- 一括アクション ----
  const bulkSet = (target: 'duplicates' | 'all', action: RowAction) => {
    if (!preview) return;
    setActions(prev => {
      const next = { ...prev };
      preview.rows.forEach(r => {
        if (r.errors.length > 0) return;
        if (target === 'duplicates' && r.duplicate === 'none') return;
        next[r.rowNumber] = action;
      });
      return next;
    });
  };

  const counts = useMemo(() => {
    if (!preview) return { insert: 0, overwrite: 0, skip: 0, error: 0, fee: 0 };
    let insert = 0, overwrite = 0, skip = 0, error = 0, fee = 0;
    preview.rows.forEach(r => {
      if (r.errors.length > 0) { error++; return; }
      const a = actions[r.rowNumber] ?? 'skip';
      if (a === 'insert') { insert++; fee += r.feeAmount + r.afterPartyFeeAmount; }
      else if (a === 'overwrite') { overwrite++; fee += r.feeAmount + r.afterPartyFeeAmount; }
      else skip++;
    });
    return { insert, overwrite, skip, error, fee };
  }, [preview, actions]);

  // ---- 取り込み実行 ----
  const execute = async () => {
    if (!preview) return;
    if (counts.insert + counts.overwrite === 0) {
      toast.error('取り込む行がありません');
      return;
    }
    setImporting(true);
    try {
      const rows = preview.rows
        .filter(r => r.errors.length === 0)
        .map(r => ({
          rowNumber: r.rowNumber,
          name: r.name,
          clubName: r.clubName,
          gender: r.gender,
          position: r.position,
          participationType: r.participationType,
          memberType: r.memberType,
          mealRequired: r.mealRequired,
          note: r.note,
          matchedUserId: r.matchedUserId ?? null,
          matchedClubId: r.matchedClubId ?? null,
          action: actions[r.rowNumber] ?? 'skip',
          targetAttendanceId: r.duplicateOf?.attendanceId ?? null,
        }));

      const res = await fetch(`/api/meetings/${meetingId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '取り込みに失敗しました');
        return;
      }
      setResult(data);
      setStep('done');
      toast.success(
        `${data.insertedCount}件を追加、${data.updatedCount}件を更新しました`,
      );
    } catch {
      toast.error('取り込みに失敗しました');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        {/* ヘッダ */}
        <header className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            <div>
              <h2 className="font-semibold text-gray-900">スプレッドシート取り込み</h2>
              <p className="text-xs text-gray-500">{meetingTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* ステップ表示 */}
        <nav className="flex items-center gap-2 border-b bg-gray-50 px-5 py-2 text-xs">
          {[
            { k: 'upload', label: '1. ファイル選択' },
            { k: 'preview', label: '2. 内容確認・重複処理' },
            { k: 'done', label: '3. 完了' },
          ].map(s => (
            <span
              key={s.k}
              className={`rounded-full px-2.5 py-1 ${
                step === s.k
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-white text-gray-500 border'
              }`}
            >
              {s.label}
            </span>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-5">
          {/* ============ STEP 1: アップロード ============ */}
          {step === 'upload' && (
            <section className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">スプシで管理した出席者をまとめて取り込めます</p>
                    <ul className="list-disc pl-4 text-xs leading-relaxed text-blue-800">
                      <li>「氏名」列があるシートなら自動でヘッダを検出します</li>
                      <li>「例会のみ」「例会+懇親会」の2列に○を付ける形式にも対応</li>
                      <li>アプリで既に登録済みの方は<strong>重複として検出</strong>し、スキップ／上書きを選べます</li>
                      <li>Googleスプレッドシートは「.xlsx」または「.csv」でダウンロードしてください</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4" />
                  取り込み用ひな型（Excel）をダウンロード
                </Button>
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 transition ${
                  dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                    <p className="text-sm text-gray-600">解析中...</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">
                      ファイルをドラッグ＆ドロップ、またはクリックして選択
                    </p>
                    <p className="text-xs text-gray-500">.xlsx / .csv（最大 5MB）</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm,.csv,.txt"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = '';
                }}
              />
            </section>
          )}

          {/* ============ STEP 2: プレビュー ============ */}
          {step === 'preview' && preview && (
            <section className="space-y-4">
              {/* サマリー */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryChip label="読み取り行" value={`${preview.summary.total}件`} tone="gray" />
                <SummaryChip label="新規取り込み可" value={`${preview.summary.importable}件`} tone="green" />
                <SummaryChip
                  label="既存と重複"
                  value={`${preview.summary.duplicateExisting}件`}
                  tone={preview.summary.duplicateExisting ? 'amber' : 'gray'}
                />
                <SummaryChip
                  label="ファイル内重複"
                  value={`${preview.summary.duplicateInFile}件`}
                  tone={preview.summary.duplicateInFile ? 'amber' : 'gray'}
                />
              </div>

              <p className="text-xs text-gray-500">
                {preview.file.name}
                {preview.file.sheetName && `（シート: ${preview.file.sheetName}）`}
                ／ ヘッダ行: {preview.file.headerRowNumber}行目
                ／ この例会の既存登録: {preview.existingCount}件
              </p>

              {preview.summary.duplicateExisting > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">
                        アプリ側で既に登録済みの方が {preview.summary.duplicateExisting} 名います
                      </p>
                      <p className="text-xs">
                        既定では<strong>スキップ</strong>（二重登録を防止）になっています。
                        シートの内容で上書きしたい場合は「上書き」を選んでください。
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 一括操作 */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-gray-50 p-2 text-xs">
                <span className="font-medium text-gray-600">一括設定:</span>
                <Button variant="outline" size="sm" onClick={() => bulkSet('all', 'insert')}>
                  すべて追加
                </Button>
                <Button variant="outline" size="sm" onClick={() => bulkSet('duplicates', 'skip')}>
                  重複はスキップ
                </Button>
                <Button variant="outline" size="sm" onClick={() => bulkSet('duplicates', 'overwrite')}>
                  重複は上書き
                </Button>
                <Button variant="outline" size="sm" onClick={() => bulkSet('all', 'skip')}>
                  すべてスキップ
                </Button>
              </div>

              {/* テーブル */}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="px-2 py-2 text-left">行</th>
                      <th className="px-2 py-2 text-left">氏名</th>
                      <th className="px-2 py-2 text-left">クラブ</th>
                      <th className="px-2 py-2 text-left">区分</th>
                      <th className="px-2 py-2 text-left">参加形式</th>
                      <th className="px-2 py-2 text-right">金額</th>
                      <th className="px-2 py-2 text-left">状態</th>
                      <th className="px-2 py-2 text-left">処理</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.rows.map(r => {
                      const action = actions[r.rowNumber] ?? 'skip';
                      const hasError = r.errors.length > 0;
                      return (
                        <tr
                          key={r.rowNumber}
                          className={
                            hasError
                              ? 'bg-red-50'
                              : r.duplicate !== 'none'
                                ? 'bg-amber-50/60'
                                : action === 'skip'
                                  ? 'bg-gray-50 text-gray-400'
                                  : ''
                          }
                        >
                          <td className="px-2 py-1.5 text-gray-400">{r.rowNumber}</td>
                          <td className="px-2 py-1.5 font-medium text-gray-900">
                            {r.name || <span className="text-red-500">（空）</span>}
                            {r.matchedUserId && (
                              <Badge className="ml-1 bg-blue-100 text-blue-700 text-[10px]">会員照合</Badge>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600">
                            {r.clubName || '—'}
                            {r.isOwnClub && (
                              <Badge className="ml-1 bg-green-100 text-green-700 text-[10px]">自クラブ</Badge>
                            )}
                          </td>
                          <td className="px-2 py-1.5">{MEMBER_TYPE_LABELS[r.memberType] || r.memberType}</td>
                          <td className="px-2 py-1.5">
                            {PARTICIPATION_LABELS[r.participationType] || r.participationType}
                            {r.mealRequired && (
                              <span className="ml-1 text-[10px] text-gray-500">/食事要</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {(r.feeAmount + r.afterPartyFeeAmount).toLocaleString()}円
                          </td>
                          <td className="px-2 py-1.5">
                            {hasError && (
                              <span className="flex items-center gap-1 text-red-600">
                                <AlertCircle className="h-3 w-3" />
                                {r.errors[0]}
                              </span>
                            )}
                            {!hasError && r.duplicate === 'existing_attendance' && (
                              <span
                                className="flex items-center gap-1 text-amber-700"
                                title={`既存: ${r.duplicateOf?.displayName}（${r.duplicateOf?.clubName ?? 'クラブ不明'}／${PARTICIPATION_LABELS[r.duplicateOf?.participationType ?? ''] ?? '—'}）`}
                              >
                                <Copy className="h-3 w-3" />
                                登録済み
                                {r.duplicateOf?.conflicting && (
                                  <Badge className="bg-red-100 text-red-700 text-[10px]">内容相違</Badge>
                                )}
                              </span>
                            )}
                            {!hasError && r.duplicate === 'duplicate_in_file' && (
                              <span className="flex items-center gap-1 text-amber-700">
                                <Copy className="h-3 w-3" />
                                ファイル内重複（{r.duplicateOf?.rowNumber}行目）
                              </span>
                            )}
                            {!hasError && r.duplicate === 'none' && r.warnings.length > 0 && (
                              <span className="text-gray-500" title={r.warnings.join(' / ')}>
                                <AlertTriangle className="inline h-3 w-3 text-amber-500" />{' '}
                                {r.warnings.length}件の注意
                              </span>
                            )}
                            {!hasError && r.duplicate === 'none' && r.warnings.length === 0 && (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle2 className="h-3 w-3" />
                                OK
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              disabled={hasError}
                              value={action}
                              onChange={e =>
                                setActions(prev => ({
                                  ...prev,
                                  [r.rowNumber]: e.target.value as RowAction,
                                }))
                              }
                              className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs disabled:bg-gray-100"
                            >
                              <option value="skip">スキップ</option>
                              <option value="insert">
                                {r.duplicate === 'none' ? '追加' : 'そのまま追加'}
                              </option>
                              {r.duplicate === 'existing_attendance' && (
                                <option value="overwrite">上書き</option>
                              )}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ============ STEP 3: 完了 ============ */}
          {step === 'done' && result && (
            <section className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-4">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
                <p className="text-lg font-semibold text-gray-900">取り込みが完了しました</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryChip label="追加" value={`${result.insertedCount}件`} tone="green" />
                <SummaryChip label="上書き" value={`${result.updatedCount}件`} tone="blue" />
                <SummaryChip label="スキップ" value={`${result.skippedCount}件`} tone="gray" />
                <SummaryChip
                  label="失敗"
                  value={`${result.failedCount}件`}
                  tone={result.failedCount ? 'red' : 'gray'}
                />
              </div>

              {result.isLate && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  登録締切を過ぎているため、追加した出席は「遅延登録」として記録されました。
                  {!result.mealAllowed && '（この例会の設定により食事は不可としています）'}
                </div>
              )}

              {result.failed?.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <p className="mb-1 font-medium">取り込めなかった行:</p>
                  <ul className="list-disc pl-4">
                    {result.failed.map((f: any, i: number) => (
                      <li key={i}>
                        {f.rowNumber}行目 {f.name}: {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>

        {/* フッタ */}
        <footer className="flex items-center justify-between gap-2 border-t bg-gray-50 px-5 py-3">
          {step === 'preview' && preview ? (
            <>
              <div className="text-xs text-gray-600">
                追加 <strong className="text-green-700">{counts.insert}</strong> 件 ／ 上書き{' '}
                <strong className="text-blue-700">{counts.overwrite}</strong> 件 ／ スキップ{' '}
                {counts.skip} 件
                {counts.error > 0 && (
                  <span className="text-red-600"> ／ エラー {counts.error} 件</span>
                )}
                <span className="ml-2 text-gray-500">
                  （請求合計 {counts.fee.toLocaleString()}円）
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep('upload')} disabled={importing}>
                  <ArrowLeft className="h-4 w-4" />
                  戻る
                </Button>
                <Button
                  size="sm"
                  onClick={execute}
                  disabled={importing || counts.insert + counts.overwrite === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      取り込み中...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      {counts.insert + counts.overwrite}件を取り込む
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : step === 'done' ? (
            <>
              <span />
              <Button
                size="sm"
                onClick={() => { onImported(); onClose(); }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                閉じて一覧を更新
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-500">
                取り込んだ出席は「取り込み」として記録され、後から個別に編集できます
              </span>
              <Button variant="outline" size="sm" onClick={onClose}>
                キャンセル
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function SummaryChip({
  label, value, tone,
}: { label: string; value: string; tone: 'gray' | 'green' | 'amber' | 'blue' | 'red' }) {
  const tones: Record<string, string> = {
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    green: 'bg-green-50 border-green-200 text-green-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[11px] opacity-80">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}
