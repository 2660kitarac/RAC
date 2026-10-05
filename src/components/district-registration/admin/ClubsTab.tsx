'use client';

/**
 * 管理画面「クラブ別」タブ
 *  - 申込（クラブ）ごとの一覧、入金状況のその場編集
 *  - 詳細ダイアログ（参加者・物販・連絡事項・役員メモ・修正・取り消し）
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Copy, Eye, Mail, Pencil, Phone, Search, Undo2, XCircle } from 'lucide-react';
import EntryForm from '@/components/district-registration/EntryForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { attendeeName, calcFees } from '@/lib/event-registration/calc';
import { PAYMENT_STATUS_LABELS, type PaymentStatus, type RegistrationFormConfig } from '@/lib/event-registration/types';
import { inputOf, type ClubOption, type RegistrationRow } from './dashboard-types';
import { copyText, formatDateTime, todayJst, yen } from './shared';

interface ClubsTabProps {
  formId: string;
  slug: string;
  origin: string;
  config: RegistrationFormConfig;
  districtName: string;
  clubs: ClubOption[];
  registrations: RegistrationRow[];
  /** 1件更新されたとき（PATCH の返り値で差し替える） */
  onUpdated: (row: RegistrationRow) => void;
  /** 全体を読み込み直す */
  onReload: () => void;
}

/** PATCH /registrations/[rid] を呼ぶ */
async function patchRegistration(formId: string, rid: string, body: unknown): Promise<RegistrationRow> {
  const res = await fetch(`/api/district/registration-forms/${formId}/registrations/${rid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '更新に失敗しました');
  return data.registration as RegistrationRow;
}

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  unpaid: 'border-red-200 bg-red-50 text-red-700',
  partial: 'border-amber-200 bg-amber-50 text-amber-800',
  paid: 'border-green-200 bg-green-50 text-green-700',
};

/** 入金状況のその場編集 */
function PaymentEditor({ formId, row, onUpdated }: { formId: string; row: RegistrationRow; onUpdated: (r: RegistrationRow) => void }) {
  const [status, setStatus] = useState<PaymentStatus>(row.paymentStatus ?? 'unpaid');
  const [amount, setAmount] = useState<number>(row.paidAmount ?? 0);
  const [paidAt, setPaidAt] = useState<string>(row.paidAt?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = status !== row.paymentStatus || amount !== row.paidAmount || paidAt !== (row.paidAt?.slice(0, 10) ?? '');
  const disabled = row.status === 'cancelled';

  const changeStatus = (s: PaymentStatus) => {
    setStatus(s);
    if (s === 'paid') {
      // 入金済にしたら、金額は請求額・日付は今日を初期値にする
      setAmount(row.totalAmount);
      setPaidAt(paidAt || todayJst());
    } else if (s === 'unpaid') {
      setAmount(0);
      setPaidAt('');
    } else if (!paidAt) {
      setPaidAt(todayJst());
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await patchRegistration(formId, row.id, {
        payment: { status, paidAmount: amount, paidAt: paidAt || null },
      });
      onUpdated(updated);
      toast.success(`${row.clubName}：${PAYMENT_STATUS_LABELS[status]}にしました`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-1.5 md:w-48">
      <select
        value={status}
        disabled={disabled}
        onChange={e => changeStatus(e.target.value as PaymentStatus)}
        className={`h-9 w-full rounded-md border px-2 text-sm font-medium ${PAYMENT_COLORS[status]}`}
        aria-label="入金状況"
      >
        {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map(s => (
          <option key={s} value={s}>
            {PAYMENT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {status !== 'unpaid' && (
        <div className="flex gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={String(amount)}
            disabled={disabled}
            onChange={e => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="h-9 w-full min-w-0 rounded-md border border-gray-300 px-2 text-sm"
            aria-label="入金額"
          />
          <input
            type="date"
            value={paidAt}
            disabled={disabled}
            onChange={e => setPaidAt(e.target.value)}
            className="h-9 w-full min-w-0 rounded-md border border-gray-300 px-1 text-sm"
            aria-label="入金日"
          />
        </div>
      )}
      {status !== 'unpaid' && amount !== row.totalAmount && (
        <span className="text-xs text-amber-700">請求額 {yen(row.totalAmount)} と差額 {yen(row.totalAmount - amount)}</span>
      )}
      {dirty && (
        <Button size="sm" onClick={save} loading={saving}>
          入金状況を保存
        </Button>
      )}
    </div>
  );
}

/** 申込の詳細ダイアログ */
function DetailDialog({
  formId, slug, origin, config, districtName, clubs, row, open, onOpenChange, onUpdated, onReload,
}: Omit<ClubsTabProps, 'registrations'> & { row: RegistrationRow; open: boolean; onOpenChange: (v: boolean) => void }) {
  const input = inputOf(row);
  const fees = calcFees(config, input);
  const [note, setNote] = useState(row.adminNote ?? '');
  const [savingNote, setSavingNote] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelled = row.status === 'cancelled';

  const saveNote = async () => {
    setSavingNote(true);
    try {
      onUpdated(await patchRegistration(formId, row.id, { adminNote: note }));
      toast.success('メモを保存しました');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingNote(false);
    }
  };

  const toggleCancel = async () => {
    const msg = cancelled
      ? `${row.clubName} の申込の取り消しを解除しますか？集計に戻ります。`
      : `${row.clubName} の申込を取り消しますか？集計・金額から外れます（データは残り、あとで解除できます）。`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      onUpdated(await patchRegistration(formId, row.id, { status: cancelled ? 'submitted' : 'cancelled' }));
      toast.success(cancelled ? '取り消しを解除しました' : '申込を取り消しました');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyEditLink = () => {
    copyText(`${origin}/entry/${slug}/edit/${row.editToken}`, '修正用リンクをコピーしました（登録責任者以外には共有しないでください）');
  };

  const catName = (key: string) => config.categories.find(c => c.key === key)?.name ?? '未設定';

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        onOpenChange(v);
        if (!v) setEditing(false);
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-10">
            {row.clubName}
            {cancelled && <Badge variant="destructive">取消</Badge>}
          </DialogTitle>
          <DialogDescription>
            申込 {formatDateTime(row.submittedAt)}／更新 {formatDateTime(row.updatedAt)}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <div className="min-w-0">
            <EntryForm
              form={config}
              districtName={districtName}
              clubs={clubs}
              accepting={true}
              mode="admin-edit"
              formId={formId}
              registrationId={row.id}
              initialInput={input}
              registrationStatus={row.status}
              onSaved={() => {
                setEditing(false);
                onOpenChange(false);
                onReload();
              }}
            />
            <Button variant="outline" className="mt-3 w-full" onClick={() => setEditing(false)}>
              修正をやめる
            </Button>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* 登録責任者 */}
            <div className="rounded-md bg-gray-50 p-3">
              <div className="text-xs text-gray-500">登録責任者</div>
              <div className="font-medium text-gray-900">{row.registrantName}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                <a href={`mailto:${row.registrantEmail}`} className="inline-flex items-center gap-1 break-all text-blue-600 hover:underline">
                  <Mail className="h-3.5 w-3.5" />
                  {row.registrantEmail}
                </a>
                {row.registrantPhone && (
                  <a href={`tel:${row.registrantPhone}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                    <Phone className="h-3.5 w-3.5" />
                    {row.registrantPhone}
                  </a>
                )}
              </div>
              {row.districtName && <div className="mt-1 text-xs text-gray-500">地区：{row.districtName}</div>}
            </div>

            {/* 参加者 */}
            <div>
              <h3 className="mb-1 font-semibold text-gray-900">参加者 {input.attendees.length}名</h3>
              {input.attendees.length === 0 ? (
                <p className="text-gray-500">参加者はいません</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
                  {input.attendees.map((a, i) => (
                    <li key={a.id || i} className="p-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="font-medium text-gray-900">
                          {i + 1}. {attendeeName(a)}
                          {(a.lastKana || a.firstKana) && <span className="ml-1 text-xs font-normal text-gray-500">（{[a.lastKana, a.firstKana].filter(Boolean).join(' ')}）</span>}
                        </span>
                        <span className="text-gray-700">{yen(fees.perAttendee[a.id])}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-xs">
                        <Badge variant={config.categories.some(c => c.key === a.category) ? 'secondary' : 'warning'}>{catName(a.category)}</Badge>
                        {a.position && <Badge variant="outline">{a.position}</Badge>}
                        {a.clubName && <Badge variant="outline">{a.clubName}</Badge>}
                        {a.under20 && <Badge variant="warning">20歳未満</Badge>}
                        {config.sessions.filter(s => a.sessions?.[s.key]).map(s => (
                          <Badge key={s.key} variant="info">{s.name}</Badge>
                        ))}
                      </div>
                      {a.note && <div className="mt-1 text-xs text-gray-600">備考：{a.note}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 物販・協賛 */}
            {(fees.itemLines.length > 0 || input.items.named.length > 0) && (
              <div>
                <h3 className="mb-1 font-semibold text-gray-900">物販・協賛</h3>
                <ul className="space-y-0.5">
                  {fees.itemLines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{l.name}（{l.detail}）</span>
                      <span>{yen(l.amount)}</span>
                    </li>
                  ))}
                </ul>
                {input.items.named.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                    {input.items.named.map(n => {
                      const item = config.items.find(it => it.key === n.itemKey);
                      const opt = item?.options.find(o => o.key === n.optionKey);
                      return (
                        <li key={n.id}>
                          ・{item?.name ?? '（削除された項目）'}（{opt?.label ?? '未設定'}）{n.buyerName && ` 購入者：${n.buyerName}`}{n.label && ` 記載名：${n.label}`}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* 金額 */}
            <div className="rounded-md border border-gray-200 p-3">
              <div className="flex justify-between"><span className="text-gray-600">登録料</span><span>{yen(row.registrationFee)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">物販・協賛</span><span>{yen(row.itemsFee)}</span></div>
              <div className="mt-1 flex justify-between border-t border-gray-100 pt-1 font-semibold"><span>合計</span><span>{yen(row.totalAmount)}</span></div>
              <div className="mt-1 flex justify-between text-xs text-gray-600">
                <span>入金：{PAYMENT_STATUS_LABELS[row.paymentStatus] ?? row.paymentStatus}{row.paidAt && `（${row.paidAt.slice(0, 10)}）`}</span>
                <span>{yen(row.paidAmount)}</span>
              </div>
              {fees.total !== row.totalAmount && (
                <p className="mt-2 text-xs text-amber-700">
                  ※ フォームの設定変更により、現在の設定で計算すると {yen(fees.total)} になります。「内容を修正」で保存すると再計算されます。
                </p>
              )}
            </div>

            {/* 連絡事項 */}
            {input.message && (
              <div>
                <h3 className="mb-1 font-semibold text-gray-900">諸事連絡</h3>
                <p className="whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-gray-700">{input.message}</p>
              </div>
            )}

            {/* 役員メモ */}
            <div>
              <Label htmlFor={`note-${row.id}`}>地区役員メモ（申込者には見えません）</Label>
              <Textarea id={`note-${row.id}`} value={note} onChange={e => setNote(e.target.value)} rows={3} className="mt-1" placeholder="例：〇/〇 電話で人数変更の連絡あり" />
              <Button size="sm" variant="outline" className="mt-2" onClick={saveNote} loading={savingNote} disabled={note === (row.adminNote ?? '')}>
                メモを保存
              </Button>
            </div>

            {/* 操作 */}
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button size="sm" onClick={() => setEditing(true)} disabled={cancelled}>
                  <Pencil />
                  内容を修正
                </Button>
                <Button size="sm" variant="outline" onClick={copyEditLink} disabled={!origin}>
                  <Copy />
                  修正用リンクをコピー
                </Button>
                <Button size="sm" variant={cancelled ? 'outline' : 'destructive'} onClick={toggleCancel} loading={busy}>
                  {cancelled ? <Undo2 /> : <XCircle />}
                  {cancelled ? '取り消しを解除' : '取り消し'}
                </Button>
              </div>
              <p className="flex items-start gap-1 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                修正用リンクを知っている人は誰でもこの申込を修正・取り消しできます。登録責任者本人にだけ送ってください。
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ClubsTab(props: ClubsTabProps) {
  const { formId, config, districtName, registrations, onUpdated } = props;
  const [q, setQ] = useState('');
  const [payFilter, setPayFilter] = useState<'all' | PaymentStatus | 'cancelled'>('all');
  const [detailId, setDetailId] = useState<string | null>(null);

  // 同じクラブから2件以上の申込があるか（取り消し分は除く）
  const duplicateClubIds = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of registrations) {
      if (r.status !== 'submitted' || !r.clubId) continue;
      count.set(r.clubId, (count.get(r.clubId) ?? 0) + 1);
    }
    return new Set([...count].filter(([, n]) => n >= 2).map(([id]) => id));
  }, [registrations]);

  const rows = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return registrations.filter(r => {
      if (payFilter === 'cancelled' && r.status !== 'cancelled') return false;
      if (payFilter !== 'all' && payFilter !== 'cancelled' && (r.status === 'cancelled' || r.paymentStatus !== payFilter)) return false;
      if (!keyword) return true;
      return [r.clubName, r.registrantName, r.registrantEmail, r.districtName ?? ''].some(s => s.toLowerCase().includes(keyword));
    });
  }, [registrations, q, payFilter]);

  const detailRow = registrations.find(r => r.id === detailId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="クラブ名・登録責任者で検索" className="pl-9" aria-label="検索" />
        </div>
        <select
          value={payFilter}
          onChange={e => setPayFilter(e.target.value as typeof payFilter)}
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
          aria-label="入金状況で絞り込み"
        >
          <option value="all">すべての入金状況</option>
          {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map(s => (
            <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>
          ))}
          <option value="cancelled">取消のみ</option>
        </select>
      </div>
      <p className="text-xs text-gray-500">{rows.length}件を表示（取消は集計に含みません）</p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white max-md:border-0 max-md:bg-transparent">
        <table className="rac-table w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">クラブ</th>
              <th className="px-3 py-2">登録責任者</th>
              <th className="px-3 py-2 text-right">人数</th>
              <th className="px-3 py-2 text-right">金額</th>
              <th className="px-3 py-2">入金</th>
              <th className="px-3 py-2">申込／更新</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  {registrations.length === 0 ? 'まだ申込はありません' : '条件に合う申込はありません'}
                </td>
              </tr>
            )}
            {rows.map(r => {
              const cancelled = r.status === 'cancelled';
              const otherDistrict = !!r.districtName && r.districtName !== districtName;
              return (
                <tr key={r.id} className={cancelled ? 'bg-gray-50 text-gray-400 max-md:opacity-70' : ''}>
                  <td data-cell="primary" className="px-3 py-2 align-top">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`font-medium ${cancelled ? 'line-through' : 'text-gray-900'}`}>{r.clubName}</span>
                      {cancelled && <Badge variant="destructive">取消</Badge>}
                      {!cancelled && r.clubId && duplicateClubIds.has(r.clubId) && <Badge variant="warning">重複</Badge>}
                    </div>
                    {(otherDistrict || (!r.clubId && r.districtName)) && <div className="text-xs font-normal text-gray-500">{r.districtName}</div>}
                    {r.adminNote && <div className="mt-0.5 line-clamp-1 text-xs font-normal text-amber-700">メモ：{r.adminNote}</div>}
                  </td>
                  <td data-label="登録責任者" className="px-3 py-2 align-top">
                    <div className="text-right md:text-left">
                      <div>{r.registrantName}</div>
                      <a href={`mailto:${r.registrantEmail}`} className="block break-all text-xs text-blue-600 hover:underline">{r.registrantEmail}</a>
                      {r.registrantPhone && <a href={`tel:${r.registrantPhone}`} className="block text-xs text-blue-600 hover:underline">{r.registrantPhone}</a>}
                    </div>
                  </td>
                  <td data-label="人数" className="px-3 py-2 text-right align-top">{r.attendeeCount}名</td>
                  <td data-label="金額" className="px-3 py-2 text-right align-top whitespace-nowrap">{yen(r.totalAmount)}</td>
                  <td data-label="入金" className="px-3 py-2 align-top">
                    <PaymentEditor key={`${r.id}-${r.updatedAt}`} formId={formId} row={r} onUpdated={onUpdated} />
                  </td>
                  <td data-label="申込／更新" className="px-3 py-2 align-top text-xs text-gray-500">
                    <div className="text-right md:text-left">
                      <div>{formatDateTime(r.submittedAt)}</div>
                      {r.updatedAt && r.updatedAt !== r.submittedAt && <div>更新 {formatDateTime(r.updatedAt)}</div>}
                    </div>
                  </td>
                  <td data-cell="actions" className="px-3 py-2 align-top text-right">
                    <Button size="sm" variant="outline" onClick={() => setDetailId(r.id)}>
                      <Eye />
                      詳細
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detailRow && (
        <DetailDialog
          key={`${detailRow.id}-${detailRow.updatedAt}`}
          {...props}
          config={config}
          row={detailRow}
          open={!!detailRow}
          onOpenChange={v => !v && setDetailId(null)}
        />
      )}
    </div>
  );
}
