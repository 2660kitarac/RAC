'use client';

/**
 * 地区行事の申込フォーム（クラブ単位で、参加者をまとめて申し込む）
 *  - public-new  : 公開URLからの新規申込（ログイン不要）
 *  - public-edit : 修正用リンクからの確認・修正・取り消し
 *  - admin-new   : 地区役員の代理入力
 *  - admin-edit  : 地区役員による内容の修正
 * 金額と入力チェックはサーバーと同じ calcFees / validateInput を使う。
 */

import * as React from 'react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, AlertTriangle, CheckCircle2, Copy, Minus, Plus, Trash2, UserPlus, Users, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { calcFees, isAttending, validateInput } from '@/lib/event-registration/calc';
import type {
  RegistrationAttendee, RegistrationFormConfig, RegistrationInput, RegistrationItems,
} from '@/lib/event-registration/types';

export interface EntryFormProps {
  form: Omit<RegistrationFormConfig, 'notifyEmail'>;
  districtName: string;
  clubs: Array<{ id: string; name: string; shortName: string | null; type: string }>;
  accepting: boolean;
  mode: 'public-new' | 'public-edit' | 'admin-new' | 'admin-edit';
  /** public-*: form slug; used to build API URLs */
  slug?: string;
  /** public-edit: edit token */
  token?: string;
  /** admin-*: form id (and registration id for admin-edit) */
  formId?: string;
  registrationId?: string;
  /** existing input for *-edit modes */
  initialInput?: RegistrationInput;
  /** registration status for edit modes ('submitted' | 'cancelled') */
  registrationStatus?: string;
  /** called after a successful save; gets the API JSON */
  onSaved?: (result: { id?: string; editPath?: string }) => void;
}

/** 「地区外・その他（手入力）」を選んだときの値 */
const OTHER = '__other__';

/** クラブ種別の見出し（一覧のグループ分け用） */
const CLUB_TYPE_LABELS: Record<string, string> = {
  RAC: 'ローターアクトクラブ',
  RC: 'ロータリークラブ',
  OB_OG: 'OB・OG',
  GUEST: 'ゲスト',
  OTHER: 'その他',
};
const CLUB_TYPE_ORDER = ['RAC', 'RC', 'OB_OG', 'GUEST', 'OTHER'];

/** 画面で使う一意なID（http の環境でも動くように予備あり） */
function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // 予備へ
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const yen = (n: number) => `${n.toLocaleString()}円`;

/** 日付（YYYY-MM-DD…）を「2026年10月5日（月）」の形に */
function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const w = '日月火水木金土'[d.getUTCDay()];
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日（${w}）`;
}

type Config = Omit<RegistrationFormConfig, 'notifyEmail'>;

/** 空の参加者（新しい行は全部の枠に参加・区分は前の人と同じ） */
function emptyAttendee(form: Config, prev?: RegistrationAttendee): RegistrationAttendee {
  const sessions: Record<string, boolean> = {};
  for (const s of form.sessions) sessions[s.key] = true;
  const defaultCategory = prev?.category ?? (form.categories.length === 1 ? form.categories[0].key : '');
  return {
    id: newId(),
    lastName: '',
    firstName: '',
    lastKana: '',
    firstKana: '',
    clubName: '',
    position: '',
    category: defaultCategory,
    under20: false,
    sessions,
    note: '',
  };
}

/** 既存の入力を画面用に整える（欠けている項目を補う） */
function normalizeInput(form: Config, src: RegistrationInput | undefined, districtName: string): RegistrationInput {
  if (!src) {
    return {
      districtName,
      clubId: null,
      clubName: '',
      registrantName: '',
      registrantEmail: '',
      registrantPhone: '',
      message: '',
      attendees: [emptyAttendee(form)],
      items: { quantities: {}, named: [] },
    };
  }
  const items: RegistrationItems = {
    quantities: { ...(src.items?.quantities ?? {}) },
    named: (src.items?.named ?? []).map(n => ({ ...n, id: n.id || newId() })),
  };
  return {
    districtName: src.districtName ?? '',
    clubId: src.clubId ?? null,
    clubName: src.clubName ?? '',
    registrantName: src.registrantName ?? '',
    registrantEmail: src.registrantEmail ?? '',
    registrantPhone: src.registrantPhone ?? '',
    message: src.message ?? '',
    attendees: (src.attendees ?? []).map(a => ({
      ...emptyAttendee(form),
      ...a,
      id: a.id || newId(),
      sessions: { ...(a.sessions ?? {}) },
    })),
    items,
  };
}

type SaveResponse = {
  id?: string;
  editPath?: string;
  mailed?: boolean;
  error?: string;
  errors?: string[];
  fees?: { total?: number };
};

export default function EntryForm(props: EntryFormProps): React.JSX.Element {
  const {
    form, districtName, clubs, accepting, mode, slug, token, formId, registrationId,
    initialInput, registrationStatus, onSaved,
  } = props;

  const isNew = mode === 'public-new' || mode === 'admin-new';
  const isPublic = mode === 'public-new' || mode === 'public-edit';
  const isAdmin = !isPublic;

  const [input, setInput] = useState<RegistrationInput>(() => normalizeInput(form, initialInput, districtName));
  // クラブの選び方：'' 未選択 / クラブID / OTHER（手入力）
  const [clubChoice, setClubChoice] = useState<string>(() => {
    if (!initialInput) return '';
    return initialInput.clubId ?? OTHER;
  });
  const [clubFilter, setClubFilter] = useState('');
  const [website, setWebsite] = useState(''); // ボット対策（画面には出さない）
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [cancelled, setCancelled] = useState(registrationStatus === 'cancelled');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [updatedNotice, setUpdatedNotice] = useState(false);
  const [done, setDone] = useState<{ editPath: string; mailed: boolean; total: number } | null>(null);
  const errorsRef = useRef<HTMLDivElement>(null);

  // 締切後・取り消し済みは見るだけ（地区役員の画面では締切に関係なく修正できる）
  const readOnly = cancelled || (isPublic && !accepting);
  // 地区外の手入力：フォームで許可されている場合（地区役員の代理入力では常に可）
  const allowOther = form.allowOtherDistricts || isAdmin;

  const fullConfig = useMemo<RegistrationFormConfig>(() => ({ ...form, notifyEmail: '' }), [form]);
  const fees = useMemo(() => calcFees(fullConfig, input), [fullConfig, input]);
  const showPerAttendeeFee = form.feeMode !== 'per_club';

  // 枠ごとの参加人数
  const sessionCounts = useMemo(
    () => form.sessions.map(s => ({ ...s, count: input.attendees.filter(a => a.sessions?.[s.key]).length })),
    [form.sessions, input.attendees],
  );

  // クラブ一覧（種別ごと・絞り込み）
  const groupedClubs = useMemo(() => {
    const q = clubFilter.trim().toLowerCase();
    const list = q
      ? clubs.filter(c => c.name.toLowerCase().includes(q) || (c.shortName ?? '').toLowerCase().includes(q))
      : clubs;
    const types = Array.from(new Set(list.map(c => c.type))).sort((a, b) => {
      const ia = CLUB_TYPE_ORDER.indexOf(a);
      const ib = CLUB_TYPE_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return types.map(t => ({ type: t, label: CLUB_TYPE_LABELS[t] ?? t, clubs: list.filter(c => c.type === t) }));
  }, [clubs, clubFilter]);

  // ---- 入力の更新 ----
  const patch = (p: Partial<RegistrationInput>) => setInput(prev => ({ ...prev, ...p }));

  const selectClub = (value: string) => {
    setClubChoice(value);
    if (value === OTHER) {
      setInput(prev => ({ ...prev, clubId: null, clubName: '', districtName: '' }));
    } else if (value === '') {
      setInput(prev => ({ ...prev, clubId: null, clubName: '', districtName }));
    } else {
      const c = clubs.find(x => x.id === value);
      setInput(prev => ({ ...prev, clubId: value, clubName: c?.name ?? '', districtName }));
    }
  };

  const updateAttendee = (id: string, p: Partial<RegistrationAttendee>) =>
    setInput(prev => ({ ...prev, attendees: prev.attendees.map(a => (a.id === id ? { ...a, ...p } : a)) }));

  const toggleSession = (id: string, key: string, on: boolean) =>
    setInput(prev => ({
      ...prev,
      attendees: prev.attendees.map(a => (a.id === id ? { ...a, sessions: { ...a.sessions, [key]: on } } : a)),
    }));

  const addAttendee = () =>
    setInput(prev => ({
      ...prev,
      attendees: [...prev.attendees, emptyAttendee(form, prev.attendees[prev.attendees.length - 1])],
    }));

  const removeAttendee = (id: string) =>
    setInput(prev => ({ ...prev, attendees: prev.attendees.filter(a => a.id !== id) }));

  // 前の人の区分・参加枠をコピー
  const copyFromPrev = (index: number) =>
    setInput(prev => {
      const src = prev.attendees[index - 1];
      if (!src) return prev;
      return {
        ...prev,
        attendees: prev.attendees.map((a, i) =>
          i === index ? { ...a, category: src.category, sessions: { ...src.sessions }, clubName: a.clubName || src.clubName } : a,
        ),
      };
    });

  const setQuantity = (key: string, qty: number) =>
    setInput(prev => ({
      ...prev,
      items: { ...prev.items, quantities: { ...prev.items.quantities, [key]: Math.max(0, Math.min(999, Math.floor(qty) || 0)) } },
    }));

  const addNamed = (itemKey: string) => {
    const item = form.items.find(i => i.key === itemKey);
    setInput(prev => ({
      ...prev,
      items: {
        ...prev.items,
        named: [
          ...prev.items.named,
          { id: newId(), itemKey, optionKey: item && item.options.length === 1 ? item.options[0].key : '', buyerName: '', label: '' },
        ],
      },
    }));
  };

  const updateNamed = (id: string, p: Partial<RegistrationItems['named'][number]>) =>
    setInput(prev => ({
      ...prev,
      items: { ...prev.items, named: prev.items.named.map(n => (n.id === id ? { ...n, ...p } : n)) },
    }));

  const removeNamed = (id: string) =>
    setInput(prev => ({ ...prev, items: { ...prev.items, named: prev.items.named.filter(n => n.id !== id) } }));

  // ---- 送信 ----
  const showErrors = (list: string[]) => {
    setErrors(list);
    // 描画後にエラー一覧までスクロール
    window.setTimeout(() => errorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  const endpoint = (): { url: string; method: string } | null => {
    switch (mode) {
      case 'public-new':
        return slug ? { url: `/api/public/entry/${encodeURIComponent(slug)}`, method: 'POST' } : null;
      case 'public-edit':
        return slug && token
          ? { url: `/api/public/entry/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, method: 'PUT' }
          : null;
      case 'admin-new':
        return formId ? { url: `/api/district/registration-forms/${encodeURIComponent(formId)}/registrations`, method: 'POST' } : null;
      case 'admin-edit':
        return formId && registrationId
          ? {
              url: `/api/district/registration-forms/${encodeURIComponent(formId)}/registrations/${encodeURIComponent(registrationId)}`,
              method: 'PATCH',
            }
          : null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || saving) return;

    const list: string[] = [];
    if (isNew && clubChoice === '') list.push('申込クラブを選んでください');
    list.push(...validateInput(fullConfig, input).filter(m => !(isNew && clubChoice === '' && m === 'クラブ名を入力してください')));
    if (list.length > 0) {
      showErrors(list);
      return;
    }

    const ep = endpoint();
    if (!ep) {
      toast.error('送信先が正しく設定されていません');
      return;
    }

    setSaving(true);
    setErrors([]);
    setUpdatedNotice(false);
    try {
      const body: Record<string, unknown> = { input };
      if (mode === 'public-new') body.website = website;
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as SaveResponse;
      if (!res.ok) {
        const errs = json.errors && json.errors.length > 0 ? json.errors : [json.error || '保存に失敗しました'];
        showErrors(errs);
        toast.error(errs[0]);
        return;
      }

      if (mode === 'public-new') {
        setDone({ editPath: json.editPath ?? '', mailed: json.mailed !== false, total: json.fees?.total ?? fees.total });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        onSaved?.({ id: json.id, editPath: json.editPath });
      } else if (mode === 'public-edit') {
        toast.success('更新しました');
        setUpdatedNotice(true);
        onSaved?.({});
      } else if (mode === 'admin-new') {
        toast.success('代理入力で申込を登録しました');
        onSaved?.({ id: json.id, editPath: json.editPath });
      } else {
        toast.success('申込内容を更新しました');
        onSaved?.({ id: registrationId });
      }
    } catch {
      showErrors(['通信に失敗しました。電波の良いところで再度お試しください']);
      toast.error('通信に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 申込の取り消し（修正用リンクから）
  const handleCancel = async () => {
    if (!slug || !token) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/public/entry/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel: true }),
      });
      const json = (await res.json().catch(() => ({}))) as SaveResponse;
      if (!res.ok) {
        toast.error(json.error || '取り消しに失敗しました');
        return;
      }
      setCancelled(true);
      setCancelOpen(false);
      toast.success('申込を取り消しました');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      onSaved?.({});
    } catch {
      toast.error('通信に失敗しました');
    } finally {
      setCancelling(false);
    }
  };

  // ---- 新規申込の完了画面 ----
  if (done) {
    return <SuccessPanel editPath={done.editPath} mailed={done.mailed} total={done.total} form={form} />;
  }

  const clubDisplay = [input.districtName, input.clubName].filter(Boolean).join(' ');

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* 状態の案内 */}
        {cancelled && (
          <Banner tone="gray" icon={<XCircle className="h-5 w-5" />}>
            この申込は取り消し済みです。{isPublic && '再度参加される場合は、新しくお申し込みください。'}
          </Banner>
        )}
        {!cancelled && isPublic && !accepting && (
          <Banner tone="amber" icon={<AlertTriangle className="h-5 w-5" />}>
            受付期間外のため修正できません。変更は地区役員にご連絡ください
          </Banner>
        )}
        {updatedNotice && !cancelled && (
          <Banner tone="green" icon={<CheckCircle2 className="h-5 w-5" />}>
            更新しました。確認メールをお送りしています。
          </Banner>
        )}

        {/* エラー一覧（スクロールの目印として常に置く） */}
        <div ref={errorsRef} className="scroll-mt-4">
          {errors.length > 0 && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" />
                入力内容をご確認ください
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {errors.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <fieldset disabled={readOnly || saving} className="min-w-0 space-y-4">
          {/* ボット対策の隠し入力（新規の公開申込のみ） */}
          {mode === 'public-new' && (
            <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
              <label htmlFor="entry-website">ウェブサイト</label>
              <input
                id="entry-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={e => setWebsite(e.target.value)}
              />
            </div>
          )}

          {/* a. 申込クラブ・登録責任者 */}
          <Section title="申込クラブ">
            {isNew ? (
              <div className="space-y-3">
                {clubs.length > 12 && (
                  <Input
                    type="search"
                    placeholder="クラブ名で絞り込み"
                    value={clubFilter}
                    onChange={e => setClubFilter(e.target.value)}
                    className="h-11 text-base sm:h-10 sm:text-sm"
                    aria-label="クラブ名で絞り込み"
                  />
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="entry-club" required>
                    クラブ{districtName && <span className="ml-1 font-normal text-gray-500">（{districtName}）</span>}
                  </Label>
                  <select
                    id="entry-club"
                    value={clubChoice}
                    onChange={e => selectClub(e.target.value)}
                    className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 sm:h-10 sm:text-sm"
                  >
                    <option value="">選択してください</option>
                    {/* 絞り込みで選択中のクラブが消えないように残す */}
                    {clubChoice && clubChoice !== OTHER && !groupedClubs.some(g => g.clubs.some(c => c.id === clubChoice)) && (
                      <option value={clubChoice}>{input.clubName}</option>
                    )}
                    {groupedClubs.map(g => (
                      <optgroup key={g.type} label={g.label}>
                        {g.clubs.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {allowOther && <option value={OTHER}>地区外・その他（手入力）</option>}
                  </select>
                </div>
                {clubChoice === OTHER && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="entry-district" label="地区名">
                      <Input
                        id="entry-district"
                        value={input.districtName}
                        onChange={e => patch({ districtName: e.target.value })}
                        placeholder="例：第2650地区"
                        className="h-11 text-base sm:h-10 sm:text-sm"
                      />
                    </Field>
                    <Field id="entry-clubname" label="クラブ名" required>
                      <Input
                        id="entry-clubname"
                        value={input.clubName}
                        onChange={e => patch({ clubName: e.target.value })}
                        placeholder="例：京都ローターアクトクラブ"
                        className="h-11 text-base sm:h-10 sm:text-sm"
                      />
                    </Field>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md bg-gray-50 px-3 py-2.5">
                <p className="text-xs text-gray-500">申込クラブ</p>
                <p className="font-medium text-gray-900 break-words">{clubDisplay || '—'}</p>
                <p className="mt-0.5 text-xs text-gray-500">クラブの変更はできません。違う場合は地区役員にご連絡ください。</p>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field id="entry-registrant" label="登録責任者（氏名）" required>
                <Input
                  id="entry-registrant"
                  autoComplete="name"
                  value={input.registrantName}
                  onChange={e => patch({ registrantName: e.target.value })}
                  className="h-11 text-base sm:h-10 sm:text-sm"
                />
              </Field>
              <Field id="entry-email" label="連絡先メール" required>
                <Input
                  id="entry-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={input.registrantEmail}
                  onChange={e => patch({ registrantEmail: e.target.value })}
                  className="h-11 text-base sm:h-10 sm:text-sm"
                />
              </Field>
              <Field id="entry-phone" label="電話">
                <Input
                  id="entry-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={input.registrantPhone}
                  onChange={e => patch({ registrantPhone: e.target.value })}
                  className="h-11 text-base sm:h-10 sm:text-sm"
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field id="entry-message" label="諸事連絡（任意）">
                <Textarea
                  id="entry-message"
                  rows={3}
                  value={input.message}
                  onChange={e => patch({ message: e.target.value })}
                  placeholder="地区役員への連絡事項があればご記入ください"
                  className="text-base sm:text-sm"
                />
              </Field>
            </div>
          </Section>

          {/* b. 参加者 */}
          <Section
            title="参加者"
            aside={
              <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                <Users className="h-4 w-4" />
                {input.attendees.length}名
              </span>
            }
          >
            {form.sessions.length > 0 && input.attendees.length > 0 && (
              <p className="mb-3 text-xs text-gray-600">
                参加者 {input.attendees.length}名（{sessionCounts.map(s => `${s.name} ${s.count}名`).join('・')}）
              </p>
            )}

            <div className="space-y-3">
              {input.attendees.map((a, index) => (
                <AttendeeCard
                  key={a.id}
                  form={form}
                  attendee={a}
                  index={index}
                  clubPlaceholder={input.clubName}
                  fee={showPerAttendeeFee ? fees.perAttendee[a.id] ?? 0 : null}
                  onChange={p => updateAttendee(a.id, p)}
                  onToggleSession={(key, on) => toggleSession(a.id, key, on)}
                  onRemove={() => removeAttendee(a.id)}
                  onCopyPrev={index > 0 ? () => copyFromPrev(index) : undefined}
                />
              ))}
              {input.attendees.length === 0 && (
                <p className="rounded-md border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
                  参加者がまだいません
                </p>
              )}
            </div>

            {!readOnly && (
              <Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={addAttendee}>
                <UserPlus className="h-4 w-4" />
                参加者を追加
              </Button>
            )}
          </Section>

          {/* c. 物販・協賛 */}
          {form.items.length > 0 && (
            <Section title="物販・協賛">
              <div className="space-y-4">
                {form.items.map(item =>
                  item.kind === 'quantity' ? (
                    <div key={item.key} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 break-words">{item.name}</p>
                          <p className="text-sm text-gray-600">{yen(item.price)}／点</p>
                        </div>
                        <QuantityStepper
                          id={`item-${item.key}`}
                          label={item.name}
                          value={input.items.quantities[item.key] ?? 0}
                          onChange={v => setQuantity(item.key, v)}
                        />
                      </div>
                      {item.description && (
                        <p className="mt-2 whitespace-pre-wrap text-xs text-gray-500">{item.description}</p>
                      )}
                    </div>
                  ) : (
                    <div key={item.key} className="rounded-lg border border-gray-200 p-3">
                      <p className="font-medium text-gray-900 break-words">{item.name}</p>
                      <p className="text-sm text-gray-600">
                        {item.options.map(o => `${o.label} ${yen(o.price)}`).join('／')}
                      </p>
                      {item.description && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{item.description}</p>
                      )}
                      <div className="mt-3 space-y-3">
                        {input.items.named
                          .filter(n => n.itemKey === item.key)
                          .map((n, i) => (
                            <div key={n.id} className="rounded-md bg-gray-50 p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-600">{i + 1}件目</span>
                                {!readOnly && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-red-600 hover:bg-red-50"
                                    onClick={() => removeNamed(n.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    削除
                                  </Button>
                                )}
                              </div>
                              <div className="grid gap-3 sm:grid-cols-3">
                                <Field id={`${n.id}-opt`} label="種類" required>
                                  <select
                                    id={`${n.id}-opt`}
                                    value={n.optionKey}
                                    onChange={e => updateNamed(n.id, { optionKey: e.target.value })}
                                    className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 sm:h-10 sm:text-sm"
                                  >
                                    <option value="">選択してください</option>
                                    {item.options.map(o => (
                                      <option key={o.key} value={o.key}>
                                        {o.label}（{yen(o.price)}）
                                      </option>
                                    ))}
                                  </select>
                                </Field>
                                <Field id={`${n.id}-buyer`} label="購入者名">
                                  <Input
                                    id={`${n.id}-buyer`}
                                    value={n.buyerName}
                                    onChange={e => updateNamed(n.id, { buyerName: e.target.value })}
                                    className="h-11 text-base sm:h-10 sm:text-sm"
                                  />
                                </Field>
                                <Field id={`${n.id}-label`} label="記載名" required={item.requireLabel}>
                                  <Input
                                    id={`${n.id}-label`}
                                    value={n.label}
                                    onChange={e => updateNamed(n.id, { label: e.target.value })}
                                    className="h-11 text-base sm:h-10 sm:text-sm"
                                  />
                                </Field>
                              </div>
                            </div>
                          ))}
                      </div>
                      {!readOnly && (
                        <Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={() => addNamed(item.key)}>
                          <Plus className="h-4 w-4" />
                          {item.name}を追加
                        </Button>
                      )}
                    </div>
                  ),
                )}
              </div>
            </Section>
          )}
        </fieldset>

        {/* d. 合計・お支払い */}
        <Section title="お支払い金額">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-600">
                登録料
                {form.feeMode === 'per_club' && <span className="ml-1 text-xs text-gray-500">（1クラブ一律）</span>}
              </dt>
              <dd className="tabular-nums">{yen(fees.registrationFee)}</dd>
            </div>
            {fees.itemLines.map((l, i) => (
              <div key={i} className="flex justify-between gap-3">
                <dt className="min-w-0 text-gray-600">
                  <span className="break-words">{l.name}</span>
                  <span className="ml-1 text-xs text-gray-500">{l.detail}</span>
                </dt>
                <dd className="shrink-0 tabular-nums">{yen(l.amount)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2">
              <dt className="font-semibold text-gray-900">合計</dt>
              <dd className="text-2xl font-bold tabular-nums text-gray-900">{yen(fees.total)}</dd>
            </div>
          </dl>
          <PaymentInfo form={form} />
        </Section>

        {/* 送信バー（スマホでは画面下に固定） */}
        {!readOnly && (
          <div className="sticky bottom-0 z-20 -mx-3 border-t border-gray-200 bg-white/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:static sm:mx-0 sm:rounded-lg sm:border sm:pb-3 sm:shadow-none">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">合計（{input.attendees.length}名）</p>
                <p className="text-xl font-bold tabular-nums text-gray-900">{yen(fees.total)}</p>
              </div>
              <Button type="submit" size="lg" loading={saving} className="h-12 shrink-0 px-6">
                {isNew ? (mode === 'admin-new' ? '登録する' : '申し込む') : '修正を保存'}
              </Button>
            </div>
          </div>
        )}
      </form>

      {/* 取り消し（修正用リンクから・受付期間中のみ） */}
      {mode === 'public-edit' && accepting && !cancelled && (
        <div className="mt-6 text-center">
          <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setCancelOpen(true)}>
            申込を取り消す
          </Button>
          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>申込を取り消しますか？</DialogTitle>
                <DialogDescription>
                  {input.clubName} のお申込み（{input.attendees.length}名）を取り消します。取り消した後は、このリンクから元に戻せません。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
                  やめる
                </Button>
                <Button type="button" variant="destructive" onClick={handleCancel} loading={cancelling}>
                  取り消す
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------------

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function Field({ id, label, required, children }: { id: string; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: 'amber' | 'gray' | 'green'; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    gray: 'border-gray-300 bg-gray-100 text-gray-800',
    green: 'border-green-200 bg-green-50 text-green-900',
  }[tone];
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', cls)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function PaymentInfo({ form }: { form: Config }) {
  if (!form.paymentDeadline && !form.bankInfo) return null;
  return (
    <div className="mt-4 space-y-2 rounded-md bg-gray-50 p-3 text-sm">
      {form.paymentDeadline && (
        <p>
          <span className="text-gray-600">お振込期限：</span>
          <span className="font-semibold">{fmtDate(form.paymentDeadline)}</span>
        </p>
      )}
      {form.bankInfo && (
        <div>
          <p className="text-gray-600">お振込先</p>
          <p className="whitespace-pre-wrap break-words text-gray-900">{form.bankInfo}</p>
        </div>
      )}
    </div>
  );
}

function QuantityStepper({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11"
        onClick={() => onChange(value - 1)}
        disabled={value <= 0}
        aria-label={`${label}を減らす`}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${label}の数量`}
        value={String(value)}
        onChange={e => onChange(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
        className="h-11 w-14 rounded-md border border-gray-300 bg-white text-center text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11"
        onClick={() => onChange(value + 1)}
        aria-label={`${label}を増やす`}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function AttendeeCard({
  form, attendee: a, index, clubPlaceholder, fee, onChange, onToggleSession, onRemove, onCopyPrev,
}: {
  form: Config;
  attendee: RegistrationAttendee;
  index: number;
  clubPlaceholder: string;
  fee: number | null;
  onChange: (p: Partial<RegistrationAttendee>) => void;
  onToggleSession: (key: string, on: boolean) => void;
  onRemove: () => void;
  onCopyPrev?: () => void;
}) {
  const f = form.attendeeFields;
  const inputCls = 'h-11 text-base sm:h-10 sm:text-sm';
  const attending = isAttending(a);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-sm font-bold text-gray-900">参加者{index + 1}</span>
          {fee !== null && (
            <span className={cn('text-xs tabular-nums', attending ? 'text-gray-600' : 'text-gray-400')}>{yen(fee)}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onCopyPrev && (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onCopyPrev}>
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden min-[400px]:inline">前の人の区分・参加枠をコピー</span>
              <span className="min-[400px]:hidden">前の人と同じ</span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-red-600 hover:bg-red-50"
            onClick={onRemove}
            aria-label={`参加者${index + 1}を削除`}
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">削除</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id={`${a.id}-last`} label="姓" required>
          <Input id={`${a.id}-last`} value={a.lastName} onChange={e => onChange({ lastName: e.target.value })} className={inputCls} />
        </Field>
        <Field id={`${a.id}-first`} label="名">
          <Input id={`${a.id}-first`} value={a.firstName} onChange={e => onChange({ firstName: e.target.value })} className={inputCls} />
        </Field>
        {f.kana && (
          <>
            <Field id={`${a.id}-lkana`} label="フリガナ（姓）">
              <Input
                id={`${a.id}-lkana`}
                value={a.lastKana}
                placeholder="セイ"
                onChange={e => onChange({ lastKana: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field id={`${a.id}-fkana`} label="フリガナ（名）">
              <Input
                id={`${a.id}-fkana`}
                value={a.firstKana}
                placeholder="メイ"
                onChange={e => onChange({ firstKana: e.target.value })}
                className={inputCls}
              />
            </Field>
          </>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {f.club && (
          <Field id={`${a.id}-club`} label="所属クラブ">
            <Input
              id={`${a.id}-club`}
              value={a.clubName}
              placeholder={clubPlaceholder || '所属クラブ名'}
              onChange={e => onChange({ clubName: e.target.value })}
              className={inputCls}
            />
          </Field>
        )}
        {f.position && (
          <Field id={`${a.id}-pos`} label="役職">
            <Input
              id={`${a.id}-pos`}
              value={a.position}
              placeholder="例：会長・幹事"
              onChange={e => onChange({ position: e.target.value })}
              className={inputCls}
            />
          </Field>
        )}
        <Field id={`${a.id}-cat`} label="区分" required>
          <select
            id={`${a.id}-cat`}
            value={a.category}
            onChange={e => onChange({ category: e.target.value })}
            className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 sm:h-10 sm:text-sm"
          >
            <option value="">選択してください</option>
            {form.categories.map(c => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {f.under20 && (
        <label className="mt-3 flex min-h-[44px] items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={a.under20}
            onChange={e => onChange({ under20: e.target.checked })}
            className="h-5 w-5 rounded border-gray-300"
          />
          20歳未満
        </label>
      )}

      {form.sessions.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-medium text-gray-700">
            参加する枠<span className="ml-1 text-red-500">*</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {form.sessions.map(s => {
              const on = !!a.sessions?.[s.key];
              return (
                <label
                  key={s.key}
                  className={cn(
                    'inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500',
                    on ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white text-gray-600',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={e => onToggleSession(s.key, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  {s.name}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3">
        <Field id={`${a.id}-note`} label={f.noteLabel || '備考'}>
          <Input id={`${a.id}-note`} value={a.note} onChange={e => onChange({ note: e.target.value })} className={inputCls} />
        </Field>
      </div>
    </div>
  );
}

/** 新規申込の完了画面（修正用リンクを必ず控えてもらう） */
function SuccessPanel({ editPath, mailed, total, form }: { editPath: string; mailed: boolean; total: number; form: Config }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editUrl = typeof window !== 'undefined' ? `${window.location.origin}${editPath}` : editPath;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(editUrl);
      setCopied(true);
      toast.success('リンクをコピーしました');
    } catch {
      // クリップボードが使えない環境では選択状態にして手動コピーしてもらう
      inputRef.current?.select();
      toast.message('リンクを選択しました。長押しでコピーしてください');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-green-600" />
        <h2 className="text-xl font-bold text-gray-900">申込を受け付けました</h2>
        <p className="mt-1 text-sm text-gray-600">{form.title}</p>
        <p className="mt-4 text-xs text-gray-500">お支払い金額</p>
        <p className="text-3xl font-bold tabular-nums text-gray-900">{yen(total)}</p>
        <div className="text-left">
          <PaymentInfo form={form} />
        </div>
      </Card>

      <Card className="border-amber-300 p-5">
        <h3 className="mb-2 font-bold text-gray-900">内容の確認・修正用リンク</h3>
        <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>このリンクで締切まで内容を修正できます。必ず保存してください（メールが届かない場合もあります）</p>
        </div>
        {!mailed && (
          <div className="mb-3 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>確認メールを送信できませんでした。このリンクを必ず控えておいてください。</p>
          </div>
        )}
        <input
          ref={inputRef}
          readOnly
          value={editUrl}
          onFocus={e => e.currentTarget.select()}
          className="mb-3 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2.5 font-mono text-xs text-gray-800"
          aria-label="修正用リンク"
        />
        <Button type="button" size="lg" className="h-12 w-full" onClick={copy}>
          <Copy className="h-5 w-5" />
          {copied ? 'コピーしました' : 'リンクをコピー'}
        </Button>
        <a href={editPath} className="mt-3 block text-center text-sm text-blue-600 underline underline-offset-2">
          いま内容を確認する
        </a>
      </Card>

      {form.contact && (
        <p className="whitespace-pre-wrap px-1 text-xs text-gray-500">
          お問い合わせ：{form.contact}
        </p>
      )}
    </div>
  );
}
