'use client';

/**
 * 行事の申込フォーム一覧（地区役員用）
 * 地区の申込フォームをカードで並べ、申込件数・入金状況をひと目で確認できるようにする。
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Copy, ExternalLink, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import QrCodeModal from '@/components/ui/QrCodeModal';
import type { RegistrationFormConfig } from '@/lib/event-registration/types';
import {
  DeadlineText, FormStatusBadge, PaymentProgress, copyText, entryUrl, formatYmd, useOrigin,
} from './shared';

interface FormSummary {
  id: string;
  slug: string;
  config: RegistrationFormConfig;
  createdAt: string;
  updatedAt: string;
  summary: { registrations: number; attendees: number; totalAmount: number; paidAmount: number };
}

async function fetchForms(): Promise<FormSummary[]> {
  const res = await fetch('/api/district/registration-forms', { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '一覧の取得に失敗しました');
  return (data.forms ?? []) as FormSummary[];
}

export default function FormsList() {
  const origin = useOrigin();
  const [forms, setForms] = useState<FormSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const load = useCallback(() => {
    return fetchForms()
      .then(list => {
        setForms(list);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    // 初回読み込み（state の更新は Promise の中で行う）
    load();
  }, [load]);

  const reload = () => {
    setReloading(true);
    load().finally(() => setReloading(false));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild className="w-full sm:w-auto">
          <Link href="/district/registrations/new">
            <Plus />
            新しい申込フォームを作る
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={reload} loading={reloading} className="self-end sm:self-auto">
          {!reloading && <RefreshCw />}
          再読み込み
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {forms === null && !error && (
        <div className="space-y-3">
          {[0, 1].map(i => (
            <div key={i} className="h-40 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
          ))}
        </div>
      )}

      {forms !== null && forms.length === 0 && (
        <Card className="p-6 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
          <h2 className="mt-3 text-base font-semibold text-gray-900">まだ申込フォームがありません</h2>
          <p className="mx-auto mt-2 max-w-xl text-left text-sm leading-relaxed text-gray-600">
            地区行事の参加申込を、Excelのメール回収ではなくWebの申込フォームで受け付けられます。
            各クラブは申込URL（またはQRコード）から参加者を入力し、金額は自動で計算されます。
            集まった申込・参加者一覧・入金状況・操作履歴は地区役員の誰もが同じ画面で確認でき、
            担当者が不在でも作業が止まりません。Excelへの書き出しもできます。
          </p>
          <Button asChild className="mt-4">
            <Link href="/district/registrations/new">
              <Plus />
              最初のフォームを作る
            </Link>
          </Button>
        </Card>
      )}

      {forms !== null && forms.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {forms.map(f => {
            const url = origin ? entryUrl(origin, f.slug) : '';
            return (
              <Card key={f.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 break-words text-base font-semibold text-gray-900">
                    <Link href={`/district/registrations/${f.id}`} className="hover:underline">
                      {f.config.title}
                    </Link>
                  </h2>
                  <div className="shrink-0">
                    <FormStatusBadge config={f.config} />
                  </div>
                </div>
                <div className="mt-2 space-y-0.5 text-sm text-gray-600">
                  <div>開催日 {formatYmd(f.config.eventDate)}</div>
                  <div>
                    <DeadlineText deadline={f.config.deadline} />
                  </div>
                </div>
                <div className="mt-3 text-sm text-gray-700">
                  申込 <span className="text-lg font-bold text-gray-900">{f.summary.registrations}</span>件
                  <span className="mx-1 text-gray-300">・</span>
                  参加 <span className="text-lg font-bold text-gray-900">{f.summary.attendees}</span>名
                </div>
                <div className="mt-2">
                  <PaymentProgress total={f.summary.totalAmount} paid={f.summary.paidAmount} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm" className="flex-1 sm:flex-none">
                    <Link href={`/district/registrations/${f.id}`}>管理画面へ</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!url || f.config.status === 'draft'}
                    onClick={() => copyText(url, '申込URLをコピーしました')}
                  >
                    <Copy />
                    申込URLをコピー
                  </Button>
                  {url && f.config.status !== 'draft' && <QrCodeModal url={url} label={f.config.title} />}
                  {url && f.config.status !== 'draft' && (
                    <Button asChild size="sm" variant="ghost">
                      <a href={url} target="_blank" rel="noopener noreferrer" aria-label="申込ページを開く">
                        <ExternalLink />
                      </a>
                    </Button>
                  )}
                </div>
                {f.config.status === 'draft' && (
                  <p className="mt-2 text-xs text-gray-500">
                    下書きのため申込ページはまだ公開されていません。
                    <button
                      type="button"
                      className="ml-1 text-blue-600 underline"
                      onClick={() => toast.info('「管理画面へ」→「設定を編集」の受付状態を「受付中」にすると公開されます')}
                    >
                      公開するには
                    </button>
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
