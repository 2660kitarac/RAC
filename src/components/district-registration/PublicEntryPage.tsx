'use client';

/**
 * 地区行事の申込ページ（公開・ログイン不要）
 *  - PublicEntryNew  : /entry/[slug]              新規申込
 *  - PublicEntryEdit : /entry/[slug]/edit/[token] 確認・修正
 * データは公開APIから読み込み、フォーム本体は EntryForm に任せる。
 */

import * as React from 'react';
import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronDown, ChevronUp, Clock, Lock, MapPin, SearchX } from 'lucide-react';

import EntryForm from '@/components/district-registration/EntryForm';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  PAYMENT_STATUS_LABELS, type PaymentStatus, type RegistrationFormConfig, type RegistrationInput,
} from '@/lib/event-registration/types';

type PublicForm = Omit<RegistrationFormConfig, 'notifyEmail'>;
type ClubOption = { id: string; name: string; shortName: string | null; type: string };

interface FormPayload {
  form: PublicForm;
  accepting: boolean;
  districtName: string;
  clubs: ClubOption[];
}

interface EditPayload extends FormPayload {
  registration: {
    id: string;
    status: string;
    input: RegistrationInput;
    totalAmount: number;
    paymentStatus: string;
    submittedAt: string | null;
    updatedAt: string | null;
  };
}

type LoadState<T> =
  | { kind: 'loading' }
  | { kind: 'notfound'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: T; deadlineDaysLeft: number | null };

/** 日付（YYYY-MM-DD…）を「2026年10月5日（月）」の形に */
function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const w = '日月火水木金土'[d.getUTCDay()];
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日（${w}）`;
}

/** 日時（DBのテキスト／ISO）を「2026/10/05 14:30」の形に */
function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
}

/** 締切までの残り日数（日本時間の日付で数える。締切当日は 0） */
function daysUntil(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
  if (!m) return null;
  const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const today = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate());
  return Math.round((end - today) / 86400000);
}

/** 公開APIを読み込む（状態の更新は fetch の結果を受けてから行う） */
function usePublicData<T extends FormPayload>(url: string | null): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ kind: 'loading' });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetch(url, { cache: 'no-store' })
      .then(async res => {
        const json = (await res.json().catch(() => ({}))) as Partial<T> & { error?: string };
        if (!alive) return;
        if (res.status === 404) setState({ kind: 'notfound', message: json.error || 'ページが見つかりません' });
        else if (!res.ok || !json.form) setState({ kind: 'error', message: json.error || '読み込みに失敗しました' });
        else setState({ kind: 'ok', data: json as T, deadlineDaysLeft: daysUntil(json.form.deadline) });
      })
      .catch(() => {
        if (alive) setState({ kind: 'error', message: '通信に失敗しました。電波の良いところで再読み込みしてください' });
      });
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

// ---------------------------------------------------------------------------
// ページ
// ---------------------------------------------------------------------------

export function PublicEntryNew({ slug }: { slug: string }) {
  const state = usePublicData<FormPayload>(`/api/public/entry/${encodeURIComponent(slug)}`);
  if (state.kind !== 'ok') return <StatusView state={state} />;
  const { form, accepting, districtName, clubs } = state.data;

  return (
    <PageShell>
      <EventHeader form={form} districtName={districtName} deadlineDaysLeft={state.deadlineDaysLeft} />
      {accepting ? (
        <EntryForm form={form} districtName={districtName} clubs={clubs} accepting={accepting} mode="public-new" slug={slug} />
      ) : (
        <Card className="p-6 text-center">
          <Lock className="mx-auto mb-2 h-10 w-10 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">受付は終了しました</h2>
          <p className="mt-1 text-sm text-gray-600">お申込み済みの内容の変更などは、地区役員にお問い合わせください。</p>
          {form.contact && <p className="mt-3 whitespace-pre-wrap break-words text-left text-sm text-gray-800">{form.contact}</p>}
        </Card>
      )}
    </PageShell>
  );
}

export function PublicEntryEdit({ slug, token }: { slug: string; token: string }) {
  const state = usePublicData<EditPayload>(
    `/api/public/entry/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`,
  );
  if (state.kind !== 'ok') return <StatusView state={state} />;
  const { form, accepting, districtName, clubs, registration } = state.data;
  const paymentLabel = PAYMENT_STATUS_LABELS[registration.paymentStatus as PaymentStatus] ?? registration.paymentStatus;

  return (
    <PageShell>
      <EventHeader form={form} districtName={districtName} deadlineDaysLeft={state.deadlineDaysLeft} compact />
      <Card className="p-4 sm:p-5">
        <h2 className="text-lg font-bold text-gray-900">お申込み内容の確認・修正</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {registration.submittedAt && (
            <>
              <dt className="text-gray-500">申込日時</dt>
              <dd className="tabular-nums">{fmtDateTime(registration.submittedAt)}</dd>
            </>
          )}
          {registration.updatedAt && registration.updatedAt !== registration.submittedAt && (
            <>
              <dt className="text-gray-500">最終更新</dt>
              <dd className="tabular-nums">{fmtDateTime(registration.updatedAt)}</dd>
            </>
          )}
          <dt className="text-gray-500">入金状況</dt>
          <dd>
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                registration.paymentStatus === 'paid'
                  ? 'bg-green-100 text-green-800'
                  : registration.paymentStatus === 'partial'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-700',
              )}
            >
              {paymentLabel}
            </span>
          </dd>
        </dl>
      </Card>
      <EntryForm
        form={form}
        districtName={districtName}
        clubs={clubs}
        accepting={accepting}
        mode="public-edit"
        slug={slug}
        token={token}
        initialInput={registration.input}
        registrationStatus={registration.status}
      />
      {form.contact && (
        <p className="whitespace-pre-wrap break-words px-1 text-xs text-gray-500">お問い合わせ：{form.contact}</p>
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl space-y-4 px-3 pb-10 pt-4 sm:px-4 sm:pt-8">{children}</main>;
}

function StatusView({ state }: { state: Exclude<LoadState<FormPayload>, { kind: 'ok' }> }) {
  if (state.kind === 'loading') {
    return (
      <PageShell>
        <div className="space-y-3" aria-busy="true" aria-label="読み込み中">
          <div className="h-28 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </PageShell>
    );
  }
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-3 py-8">
      <div className="max-w-md text-center">
        {state.kind === 'notfound' ? (
          <SearchX className="mx-auto mb-3 h-12 w-12 text-gray-400" />
        ) : (
          <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-amber-500" />
        )}
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          {state.kind === 'notfound' ? 'ページが見つかりません' : '読み込めませんでした'}
        </h1>
        <p className="break-words text-gray-600">{state.message}</p>
      </div>
    </div>
  );
}

function EventHeader({
  form, districtName, deadlineDaysLeft, compact,
}: {
  form: PublicForm;
  districtName: string;
  deadlineDaysLeft: number | null;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const desc = form.description?.trim() ?? '';
  const isLong = desc.length > 240 || desc.split('\n').length > 8;
  const deadlineSoon = deadlineDaysLeft !== null && deadlineDaysLeft >= 0 && deadlineDaysLeft <= 3;

  return (
    <Card className="p-4 sm:p-6">
      {districtName && <p className="text-xs font-medium text-blue-700">{districtName}</p>}
      <h1 className="mt-0.5 text-xl font-bold leading-snug text-gray-900 break-words sm:text-2xl">{form.title}</h1>

      <dl className="mt-3 space-y-1.5 text-sm">
        {form.eventDate && (
          <div className="flex items-start gap-2">
            <dt className="sr-only">開催日</dt>
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
            <dd>{fmtDate(form.eventDate)}</dd>
          </div>
        )}
        {form.venue && (
          <div className="flex items-start gap-2">
            <dt className="sr-only">会場</dt>
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
            <dd className="break-words">{form.venue}</dd>
          </div>
        )}
        {form.deadline && (
          <div className="flex items-start gap-2">
            <dt className="sr-only">申込締切</dt>
            <Clock className={cn('mt-0.5 h-4 w-4 shrink-0', deadlineSoon ? 'text-red-600' : 'text-gray-500')} aria-hidden />
            <dd className={cn(deadlineSoon && 'font-semibold text-red-600')}>
              申込締切 {fmtDate(form.deadline)}
              {deadlineSoon && <span className="ml-1">（{deadlineDaysLeft === 0 ? '本日まで' : `あと${deadlineDaysLeft}日`}）</span>}
            </dd>
          </div>
        )}
      </dl>

      {!compact && desc && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className={cn('relative', isLong && !expanded && 'max-h-40 overflow-hidden')}>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{desc}</p>
            {isLong && !expanded && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
            )}
          </div>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-blue-600"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  閉じる
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  案内をすべて読む
                </>
              )}
            </button>
          )}
        </div>
      )}

      {!compact && form.contact && (
        <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-700">
          <p className="mb-0.5 font-semibold">お問い合わせ</p>
          <p className="whitespace-pre-wrap break-words">{form.contact}</p>
        </div>
      )}
    </Card>
  );
}
