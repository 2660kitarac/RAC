'use client';

/**
 * 申込の管理画面（地区役員用）
 * 地区役員の誰が開いても同じ最新データ（申込・入金・操作履歴）を見られるようにする。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, ExternalLink, FileSpreadsheet, RefreshCw, Settings, UserPlus } from 'lucide-react';
import EntryForm from '@/components/district-registration/EntryForm';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QrCodeModal from '@/components/ui/QrCodeModal';
import { inputOf, type DashboardData, type RegistrationRow } from './dashboard-types';
import ClubsTab from './ClubsTab';
import { AttendeesTab, ItemsTab, LogsTab, UnregisteredTab } from './OtherTabs';
import { DeadlineText, FormStatusBadge, copyText, entryUrl, formatDateTime, formatYmd, useOrigin, yen } from './shared';

async function fetchDashboard(formId: string): Promise<DashboardData> {
  const res = await fetch(`/api/district/registration-forms/${formId}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '読み込みに失敗しました');
  return data as DashboardData;
}

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'green' | 'red' }) {
  const color = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-600' : 'text-gray-900';
  return (
    <Card className="p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-0.5 text-xl font-bold sm:text-2xl ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </Card>
  );
}

export default function RegistrationDashboard({ formId }: { formId: string }) {
  const origin = useOrigin();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string>('');

  const load = useCallback(() => {
    return fetchDashboard(formId)
      .then(d => {
        setData(d);
        setError(null);
        setLoadedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
      })
      .catch((e: Error) => setError(e.message));
  }, [formId]);

  useEffect(() => {
    // 初回読み込み（state の更新は Promise の中で行う）
    load();
  }, [load]);

  const reload = useCallback(() => {
    setReloading(true);
    load().finally(() => setReloading(false));
  }, [load]);

  /** 1件だけ差し替える（PATCH の返り値）。操作履歴も最新にするため裏で読み直す */
  const onUpdated = useCallback(
    (row: RegistrationRow) => {
      setData(d => (d ? { ...d, registrations: d.registrations.map(r => (r.id === row.id ? { ...r, ...row } : r)) } : d));
      load();
    },
    [load],
  );

  const stats = useMemo(() => {
    if (!data) return null;
    const active = data.registrations.filter(r => r.status === 'submitted');
    const clubIds = new Set(data.clubs.map(c => c.id));
    const appliedDistrictClubs = new Set(active.filter(r => r.clubId && clubIds.has(r.clubId)).map(r => r.clubId));
    const outside = active.filter(r => !r.clubId || !clubIds.has(r.clubId)).length;
    const total = active.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
    const paid = active.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    const unpaid = active.reduce((s, r) => s + Math.max(0, (r.totalAmount ?? 0) - (r.paidAmount ?? 0)), 0);
    const unpaidCount = active.filter(r => (r.totalAmount ?? 0) > (r.paidAmount ?? 0)).length;
    const attendees = active.reduce((s, r) => s + (r.attendeeCount ?? 0), 0);

    // 区分 × 参加枠 の人数
    const { config } = data.form;
    const catKeys = config.categories.map(c => c.key);
    const matrix = new Map<string, { total: number; bySession: Record<string, number> }>();
    for (const k of [...catKeys, '__none']) matrix.set(k, { total: 0, bySession: {} });
    for (const r of active) {
      for (const a of inputOf(r).attendees) {
        const k = catKeys.includes(a.category) ? a.category : '__none';
        const cell = matrix.get(k)!;
        cell.total += 1;
        for (const s of config.sessions) if (a.sessions?.[s.key]) cell.bySession[s.key] = (cell.bySession[s.key] ?? 0) + 1;
      }
    }
    return { active, appliedDistrictClubs: appliedDistrictClubs.size, outside, total, paid, unpaid, unpaidCount, attendees, matrix };
  }, [data]);

  if (error && !data) {
    return (
      <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
        <Button size="sm" variant="outline" className="ml-3" onClick={reload} loading={reloading}>再読み込み</Button>
      </div>
    );
  }

  if (!data || !stats) {
    return (
      <div className="mt-4 space-y-3">
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  const { form, registrations, logs, districtName, clubs } = data;
  const { config } = form;
  const url = origin ? entryUrl(origin, form.slug) : '';
  const published = config.status !== 'draft';
  const noneRow = stats.matrix.get('__none');
  const cancelledCount = registrations.length - stats.active.length;

  return (
    <div className="mt-2 space-y-4">
      {/* ヘッダー */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <h1 className="min-w-0 flex-1 break-words text-xl font-bold text-gray-900 sm:text-2xl">{config.title}</h1>
          <FormStatusBadge config={config} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          <span>開催日 {formatYmd(config.eventDate)}</span>
          <DeadlineText deadline={config.deadline} />
          {config.paymentDeadline && <span>振込期日 {formatYmd(config.paymentDeadline)}</span>}
        </div>
        {!published && (
          <p className="rounded-md bg-gray-50 p-2 text-xs text-gray-600">
            下書きのため申込ページはまだ公開されていません。「設定を編集」で受付状態を「受付中」にすると公開されます。
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button size="sm" variant="outline" disabled={!url || !published} onClick={() => copyText(url, '申込URLをコピーしました')}>
            <Copy />
            申込URLをコピー
          </Button>
          {url && published && (
            <div className="[&>button]:w-full">
              <QrCodeModal url={url} label={config.title} />
            </div>
          )}
          {url && published && (
            <Button asChild size="sm" variant="outline">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                申込ページを開く
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href={`/district/registrations/${form.id}/settings`}>
              <Settings />
              設定を編集
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/district/registration-forms/${form.id}/export`} download>
              <FileSpreadsheet />
              Excelで書き出す
            </a>
          </Button>
          <Button size="sm" onClick={() => setProxyOpen(true)}>
            <UserPlus />
            代理入力
          </Button>
        </div>
        <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
          {loadedAt && <span>{loadedAt} 時点</span>}
          <Button size="sm" variant="ghost" onClick={reload} loading={reloading}>
            {!reloading && <RefreshCw />}
            再読み込み
          </Button>
        </div>
      </div>

      {/* 数字のまとめ */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-5">
        <Kpi
          label="申込クラブ数"
          value={<>{stats.appliedDistrictClubs}<span className="text-sm font-normal text-gray-500"> / {clubs.length}</span></>}
          sub={stats.outside > 0 ? `ほか地区外など ${stats.outside}件` : cancelledCount > 0 ? `取消 ${cancelledCount}件` : '地区内クラブ'}
        />
        <Kpi label="参加者数" value={<>{stats.attendees}<span className="text-sm font-normal text-gray-500">名</span></>} />
        <Kpi label="合計金額" value={yen(stats.total)} />
        <Kpi label="入金済" value={yen(stats.paid)} tone="green" />
        <div className="col-span-2 md:col-span-1">
          <Kpi label="未入金" value={yen(stats.unpaid)} sub={`${stats.unpaidCount}件`} tone={stats.unpaid > 0 ? 'red' : undefined} />
        </div>
      </div>

      {/* 区分 × 参加枠 の集計 */}
      {config.sessions.length > 0 && (
        <Card className="p-3 sm:p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">集計（区分 × 参加枠）</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="sticky left-0 bg-white px-2 py-1.5 text-left font-medium">区分</th>
                  {config.sessions.map(s => <th key={s.key} className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{s.name}</th>)}
                  <th className="px-2 py-1.5 text-right font-medium">参加者計</th>
                </tr>
              </thead>
              <tbody>
                {config.categories.map(c => {
                  const cell = stats.matrix.get(c.key)!;
                  return (
                    <tr key={c.key} className="border-b border-gray-100">
                      <td className="sticky left-0 bg-white px-2 py-1.5 whitespace-nowrap">{c.name}</td>
                      {config.sessions.map(s => <td key={s.key} className="px-2 py-1.5 text-right tabular-nums">{cell.bySession[s.key] ?? 0}</td>)}
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{cell.total}</td>
                    </tr>
                  );
                })}
                {noneRow && noneRow.total > 0 && (
                  <tr className="border-b border-gray-100 text-amber-700">
                    <td className="sticky left-0 bg-white px-2 py-1.5 whitespace-nowrap">未設定</td>
                    {config.sessions.map(s => <td key={s.key} className="px-2 py-1.5 text-right tabular-nums">{noneRow.bySession[s.key] ?? 0}</td>)}
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{noneRow.total}</td>
                  </tr>
                )}
                <tr className="bg-gray-50 font-semibold">
                  <td className="sticky left-0 bg-gray-50 px-2 py-1.5">合計</td>
                  {config.sessions.map(s => (
                    <td key={s.key} className="px-2 py-1.5 text-right tabular-nums">
                      {[...stats.matrix.values()].reduce((sum, cell) => sum + (cell.bySession[s.key] ?? 0), 0)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">{[...stats.matrix.values()].reduce((sum, cell) => sum + cell.total, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* タブ */}
      <Tabs defaultValue="clubs">
        <TabsList>
          <TabsTrigger value="clubs">クラブ別</TabsTrigger>
          <TabsTrigger value="attendees">参加者一覧</TabsTrigger>
          <TabsTrigger value="items">物販・協賛</TabsTrigger>
          <TabsTrigger value="unregistered">未申込クラブ</TabsTrigger>
          <TabsTrigger value="logs">操作履歴</TabsTrigger>
        </TabsList>
        <TabsContent value="clubs">
          <ClubsTab
            formId={form.id}
            slug={form.slug}
            origin={origin}
            config={config}
            districtName={districtName}
            clubs={clubs}
            registrations={registrations}
            onUpdated={onUpdated}
            onReload={reload}
          />
        </TabsContent>
        <TabsContent value="attendees">
          <AttendeesTab config={config} registrations={registrations} />
        </TabsContent>
        <TabsContent value="items">
          <ItemsTab config={config} registrations={registrations} />
        </TabsContent>
        <TabsContent value="unregistered">
          <UnregisteredTab clubs={clubs} registrations={registrations} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab logs={logs} />
        </TabsContent>
      </Tabs>

      <p className="text-right text-xs text-gray-400">フォーム設定の最終更新 {formatDateTime(form.updatedAt)}</p>

      {/* 代理入力（メール・電話で受けた申込を地区役員が入力） */}
      <Dialog open={proxyOpen} onOpenChange={setProxyOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>代理入力</DialogTitle>
            <DialogDescription>
              メール・電話などで受けた申込を地区役員が入力します。締切後・受付終了後でも入力できます。
            </DialogDescription>
          </DialogHeader>
          {proxyOpen && (
            <div className="min-w-0">
              <EntryForm
                form={config}
                districtName={districtName}
                clubs={clubs}
                accepting={true}
                mode="admin-new"
                formId={form.id}
                onSaved={() => {
                  setProxyOpen(false);
                  reload();
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
