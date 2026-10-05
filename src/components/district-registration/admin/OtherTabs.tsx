'use client';

/**
 * 管理画面のタブ：参加者一覧／物販・協賛／未申込クラブ／操作履歴
 * どれも「取り消し」されていない申込だけを対象にする。
 */
import { useMemo, useState } from 'react';
import { Copy, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { attendeeName, calcFees } from '@/lib/event-registration/calc';
import type { RegistrationAttendee, RegistrationFormConfig } from '@/lib/event-registration/types';
import { LOG_ACTION_LABELS, inputOf, type ClubOption, type LogRow, type RegistrationRow } from './dashboard-types';
import { copyText, formatDateTime, yen } from './shared';

/* ------------------------------------------------------------------ */
/* 参加者一覧                                                           */
/* ------------------------------------------------------------------ */
export function AttendeesTab({ config, registrations }: { config: RegistrationFormConfig; registrations: RegistrationRow[] }) {
  const [q, setQ] = useState('');
  const [session, setSession] = useState('all');
  const [category, setCategory] = useState('all');

  // 申込ごとに金額を計算して、参加者1人1行に並べる
  const all = useMemo(() => {
    const list: Array<{ reg: RegistrationRow; a: RegistrationAttendee; fee: number }> = [];
    for (const reg of registrations) {
      if (reg.status !== 'submitted') continue;
      const input = inputOf(reg);
      const fees = calcFees(config, input);
      for (const a of input.attendees) list.push({ reg, a, fee: fees.perAttendee[a.id] ?? 0 });
    }
    return list;
  }, [config, registrations]);

  const categoryKeys = new Set(config.categories.map(c => c.key));
  const rows = all.filter(({ reg, a }) => {
    if (session !== 'all' && !a.sessions?.[session]) return false;
    if (category === '__none' && categoryKeys.has(a.category)) return false;
    if (category !== 'all' && category !== '__none' && a.category !== category) return false;
    const k = q.trim().toLowerCase();
    if (!k) return true;
    return [attendeeName(a), a.lastKana, a.firstKana, `${a.lastKana}${a.firstKana}`, a.clubName, reg.clubName, a.position]
      .some(s => (s ?? '').toLowerCase().includes(k));
  });

  const catName = (key: string) => config.categories.find(c => c.key === key)?.name ?? '未設定';

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="氏名・フリガナ・クラブで検索" className="pl-9" aria-label="検索" />
        </div>
        <select value={session} onChange={e => setSession(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm" aria-label="参加枠で絞り込み">
          <option value="all">すべての参加枠</option>
          {config.sessions.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm" aria-label="区分で絞り込み">
          <option value="all">すべての区分</option>
          {config.categories.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
          <option value="__none">未設定</option>
        </select>
      </div>
      <p className="text-sm text-gray-600">
        <span className="text-lg font-bold text-gray-900">{rows.length}</span>名
        {rows.length !== all.length && <span className="text-gray-400">（全{all.length}名中）</span>}
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
        <table className="rac-table w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">氏名</th>
              <th className="px-3 py-2">クラブ</th>
              {config.attendeeFields.kana && <th className="px-3 py-2">フリガナ</th>}
              {config.attendeeFields.position && <th className="px-3 py-2">役職</th>}
              <th className="px-3 py-2">区分</th>
              {config.attendeeFields.under20 && <th className="px-3 py-2 text-center">20歳未満</th>}
              {config.sessions.map(s => <th key={s.key} className="px-3 py-2 text-center whitespace-nowrap">{s.name}</th>)}
              <th className="px-3 py-2 text-right">登録料</th>
              <th className="px-3 py-2">備考</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={99} className="px-3 py-8 text-center text-gray-500">該当する参加者はいません</td>
              </tr>
            )}
            {rows.map(({ reg, a, fee }) => (
              <tr key={`${reg.id}-${a.id}`}>
                <td data-cell="primary" className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{attendeeName(a) || '（氏名なし）'}</td>
                <td data-label="クラブ" className="px-3 py-2">
                  <span className="text-right md:text-left">{a.clubName || reg.clubName}</span>
                </td>
                {config.attendeeFields.kana && <td data-label="フリガナ" className="px-3 py-2 text-gray-600">{[a.lastKana, a.firstKana].filter(Boolean).join(' ')}</td>}
                {config.attendeeFields.position && <td data-label="役職" className="px-3 py-2">{a.position}</td>}
                <td data-label="区分" className="px-3 py-2 whitespace-nowrap">
                  {categoryKeys.has(a.category) ? catName(a.category) : <Badge variant="warning">未設定</Badge>}
                </td>
                {config.attendeeFields.under20 && <td data-label="20歳未満" className="px-3 py-2 text-center">{a.under20 ? '○' : '–'}</td>}
                {config.sessions.map(s => (
                  <td key={s.key} data-label={s.name} className="px-3 py-2 text-center">
                    {a.sessions?.[s.key] ? <span className="font-semibold text-blue-700">参加</span> : <span className="text-gray-300">–</span>}
                  </td>
                ))}
                <td data-label="登録料" className="px-3 py-2 text-right whitespace-nowrap">{yen(fee)}</td>
                <td data-label="備考" data-cell="block" className="px-3 py-2 text-gray-600">{a.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 物販・協賛                                                           */
/* ------------------------------------------------------------------ */
export function ItemsTab({ config, registrations }: { config: RegistrationFormConfig; registrations: RegistrationRow[] }) {
  const active = registrations.filter(r => r.status === 'submitted').map(r => ({ reg: r, input: inputOf(r) }));

  if (config.items.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">このフォームには物販・協賛の項目がありません</p>;
  }

  // 一覧（クラブ・種類・購入者・記載名）
  const lines: Array<{ key: string; club: string; kind: string; buyer: string; label: string }> = [];
  for (const { reg, input } of active) {
    for (const item of config.items) {
      if (item.kind === 'quantity') {
        const qty = input.items.quantities[item.key] ?? 0;
        if (qty > 0) lines.push({ key: `${reg.id}-${item.key}`, club: reg.clubName, kind: `${item.name} × ${qty}`, buyer: '', label: '' });
      }
    }
    for (const n of input.items.named) {
      const item = config.items.find(i => i.key === n.itemKey);
      if (!item) continue;
      const opt = item.options.find(o => o.key === n.optionKey);
      lines.push({ key: `${reg.id}-${n.id}`, club: reg.clubName, kind: `${item.name}（${opt?.label ?? '未設定'}）`, buyer: n.buyerName, label: n.label });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {config.items.map(item => {
          if (item.kind === 'quantity') {
            const qty = active.reduce((s, { input }) => s + (input.items.quantities[item.key] ?? 0), 0);
            return (
              <div key={item.key} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="font-medium text-gray-900">{item.name}</div>
                <div className="mt-1 flex items-baseline justify-between text-sm">
                  <span><span className="text-xl font-bold">{qty}</span> 点</span>
                  <span className="font-semibold">{yen(qty * item.price)}</span>
                </div>
                <div className="text-xs text-gray-500">単価 {yen(item.price)}</div>
              </div>
            );
          }
          const named = active.flatMap(({ input }) => input.items.named.filter(n => n.itemKey === item.key));
          const total = item.options.reduce((s, o) => s + named.filter(n => n.optionKey === o.key).length * o.price, 0);
          return (
            <div key={item.key} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-gray-900">{item.name}</span>
                <span className="text-sm font-semibold">{yen(total)}</span>
              </div>
              <ul className="mt-1 space-y-0.5 text-sm">
                {item.options.map(o => {
                  const c = named.filter(n => n.optionKey === o.key).length;
                  return (
                    <li key={o.key} className="flex justify-between gap-2">
                      <span className="text-gray-600">{o.label}（{yen(o.price)}）</span>
                      <span><span className="font-semibold">{c}</span>件 = {yen(c * o.price)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white max-md:border-0 max-md:bg-transparent">
        <table className="rac-table w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">クラブ</th>
              <th className="px-3 py-2">種類</th>
              <th className="px-3 py-2">購入者</th>
              <th className="px-3 py-2">記載名</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-gray-500">まだ申込はありません</td>
              </tr>
            )}
            {lines.map(l => (
              <tr key={l.key}>
                <td data-cell="primary" className="px-3 py-2 font-medium text-gray-900">{l.club}</td>
                <td data-label="種類" className="px-3 py-2">{l.kind}</td>
                <td data-label="購入者" className="px-3 py-2">{l.buyer}</td>
                <td data-label="記載名" className="px-3 py-2">{l.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 未申込クラブ                                                         */
/* ------------------------------------------------------------------ */
export function UnregisteredTab({ clubs, registrations }: { clubs: ClubOption[]; registrations: RegistrationRow[] }) {
  const applied = new Set(registrations.filter(r => r.status === 'submitted' && r.clubId).map(r => r.clubId as string));
  const missing = clubs.filter(c => !applied.has(c.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          地区内 {clubs.length}クラブのうち、未申込 <span className="text-lg font-bold text-gray-900">{missing.length}</span>クラブ
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={missing.length === 0}
          onClick={() => copyText(missing.map(c => c.name).join('\n'), '未申込クラブの一覧をコピーしました')}
        >
          <Copy />
          一覧をコピー
        </Button>
      </div>
      {missing.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">{clubs.length === 0 ? '地区のクラブが登録されていません' : 'すべてのクラブから申込がありました'}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {missing.map(c => (
            <li key={c.id} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
              {c.name}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500">「一覧をコピー」で、催促のメッセージに貼り付けられる形（1行に1クラブ）でコピーします。</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 操作履歴                                                             */
/* ------------------------------------------------------------------ */
export function LogsTab({ logs }: { logs: LogRow[] }) {
  if (logs.length === 0) return <p className="py-8 text-center text-sm text-gray-500">操作履歴はまだありません</p>;
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      {logs.map((l, i) => (
        <li key={l.id ?? i} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:gap-3">
          <span className="shrink-0 text-xs text-gray-500 sm:w-32">{formatDateTime(l.createdAt)}</span>
          <span className="shrink-0">
            <Badge variant={l.action.startsWith('form_') ? 'secondary' : l.action === 'payment' ? 'success' : l.action.includes('cancel') ? 'destructive' : 'info'}>
              {LOG_ACTION_LABELS[l.action] ?? l.action}
            </Badge>
          </span>
          <span className="min-w-0 flex-1 break-words text-gray-800">{l.detail}</span>
          {l.actor && <span className="shrink-0 text-xs text-gray-500">{l.actor}</span>}
        </li>
      ))}
    </ul>
  );
}
