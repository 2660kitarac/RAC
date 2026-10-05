'use client';

/**
 * 申込フォームの作成・設定画面（地区役員用）
 *  - 新規作成：最初にひな形を選ぶ → 内容を整えて保存
 *  - 設定編集：既存フォームの設定を変更（申込が入っている場合は注意書きを出す）
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, FileText, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { calcFees } from '@/lib/event-registration/calc';
import {
  DEFAULT_ATTENDEE_FIELDS,
  FEE_MODE_LABELS,
  templateBySession,
  templateClubFlat,
  type FeeMode,
  type FormCategory,
  type FormItem,
  type FormSession,
  type FormStatus,
  type RegistrationFormConfig,
} from '@/lib/event-registration/types';
import { newKey, yen } from './shared';

/** 地区行事から作るときの初期値（任意） */
export type FormEditorInitialValues = Partial<Pick<RegistrationFormConfig, 'title' | 'eventDate' | 'venue' | 'deadline' | 'description'>>;

type Props =
  | { mode: 'new'; initialValues?: FormEditorInitialValues; districtEventId?: string; eventTitle?: string }
  | { mode: 'settings'; formId: string; initialConfig: RegistrationFormConfig; registrationCount: number };

/** 何も入っていないフォーム設定 */
function baseConfig(): RegistrationFormConfig {
  return {
    title: '',
    eventDate: null,
    venue: '',
    description: '',
    deadline: null,
    paymentDeadline: null,
    bankInfo: '',
    contact: '',
    notifyEmail: '',
    status: 'draft',
    allowOtherDistricts: false,
    feeMode: 'per_person',
    clubFee: 0,
    sessions: [],
    categories: [],
    items: [],
    attendeeFields: { ...DEFAULT_ATTENDEE_FIELDS },
  };
}

const TEMPLATES: Array<{ id: string; title: string; description: string; build: () => RegistrationFormConfig }> = [
  {
    id: 'session',
    title: '区分×参加枠',
    description: '例：関西四地区 情報交換会・交流会・懇親会。RC／RAC／OB・OGなど区分ごとに登録料が変わる行事向け。',
    build: () => ({ ...baseConfig(), ...templateBySession() }),
  },
  {
    id: 'club',
    title: 'クラブ一律＋グッズ・協賛',
    description: '例：END POLIO NOW×スポGOMI。クラブごとに一律の参加費と、タオル・ペナント協賛などの申込がある行事向け。',
    build: () => ({ ...baseConfig(), ...templateClubFlat() }),
  },
  {
    id: 'blank',
    title: '白紙から',
    description: '参加枠・区分を1つずつ用意した状態から、自由に作ります。',
    build: () => ({
      ...baseConfig(),
      sessions: [{ key: newKey('s'), name: '参加', charged: true }],
      categories: [{ key: newKey('c'), name: 'ローターアクター', fee: 0, sessionFees: {} }],
    }),
  },
];

const STATUS_OPTIONS: Array<{ value: FormStatus; label: string; help: string }> = [
  { value: 'draft', label: '下書き', help: '申込ページは公開されません。準備中はこの状態にしておきます。' },
  { value: 'open', label: '受付中', help: '申込URLから申込できます。締切日を過ぎると自動で受付を終了します。' },
  { value: 'closed', label: '受付終了', help: '申込ページは表示されますが、新しい申込はできません（地区役員の代理入力は可能）。' },
];

/** 数値入力欄（0以上の整数） */
function NumberInput({ value, onChange, className, ...rest }: { value: number; onChange: (n: number) => void; className?: string; 'aria-label'?: string; id?: string }) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      step={100}
      value={Number.isFinite(value) ? String(value) : '0'}
      onChange={e => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      className={className}
      {...rest}
    />
  );
}

/** 配列の要素を上下に入れ替える */
function move<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

function ChangeWarning({ count }: { count: number }) {
  return (
    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        すでに{count}件の申込があります。参加枠・区分を変更しても、申込済みの内容はそのまま残ります。
        削除した区分の参加者は「未設定」と表示され、金額は申込者または地区役員が内容を修正したときに再計算されます。
      </p>
    </div>
  );
}

export default function FormEditor(props: Props) {
  const router = useRouter();
  const isNew = props.mode === 'new';
  const [config, setConfig] = useState<RegistrationFormConfig | null>(isNew ? null : props.initialConfig);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const registrationCount = props.mode === 'settings' ? props.registrationCount : 0;

  /** 一部の項目を書き換える */
  const patch = (p: Partial<RegistrationFormConfig>) => setConfig(c => (c ? { ...c, ...p } : c));
  const patchSession = (i: number, p: Partial<FormSession>) =>
    setConfig(c => (c ? { ...c, sessions: c.sessions.map((s, j) => (j === i ? { ...s, ...p } : s)) } : c));
  const patchCategory = (i: number, p: Partial<FormCategory>) =>
    setConfig(c => (c ? { ...c, categories: c.categories.map((x, j) => (j === i ? { ...x, ...p } : x)) } : c));
  const patchItem = (i: number, p: Partial<FormItem>) =>
    setConfig(c => (c ? { ...c, items: c.items.map((x, j) => (j === i ? { ...x, ...p } : x)) } : c));

  /** 料金の例（区分ごとに1名が全枠参加したとき） */
  const feeExamples = useMemo(() => {
    if (!config) return [];
    const allSessions = Object.fromEntries(config.sessions.map(s => [s.key, true]));
    return config.categories.map(cat => {
      const fees = calcFees(config, {
        attendees: [{
          id: 'example', lastName: '', firstName: '', lastKana: '', firstKana: '', clubName: '', position: '',
          category: cat.key, under20: false, sessions: allSessions, note: '',
        }],
        items: { quantities: {}, named: [] },
      });
      return { name: cat.name, total: fees.registrationFee };
    });
  }, [config]);

  // ひな形選択（新規作成の最初）
  if (!config) {
    return (
      <div className="space-y-4">
        {props.mode === 'new' && props.eventTitle && (
          <p className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
            地区行事『{props.eventTitle}』の申込フォームとして作成します
          </p>
        )}
        <p className="text-sm text-gray-600">まず、行事の形に近いひな形を選んでください。あとから自由に変更できます。</p>
        <div className="grid gap-3 md:grid-cols-3">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                const built = t.build();
                // 地区行事から作るときは、行事の情報を最初から入れておく
                const iv = props.mode === 'new' ? props.initialValues : undefined;
                setConfig(iv ? { ...built, ...Object.fromEntries(Object.entries(iv).filter(([, v]) => v !== undefined)) } : built);
              }}
              className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span className="flex items-center gap-2 font-semibold text-gray-900">
                <FileText className="h-4 w-4 text-blue-500" />
                {t.title}
              </span>
              <span className="mt-2 text-sm text-gray-600">{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const validate = (): string | null => {
    if (!config.title.trim()) return '行事名を入力してください';
    if (config.categories.length === 0) return '区分を1つ以上作ってください';
    if (config.items.some(i => i.kind === 'named' && i.options.length === 0)) return '記載名つきの項目には種類を1つ以上作ってください';
    if (config.notifyEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.notifyEmail.trim())) return '通知先メールアドレスを正しく入力してください';
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      if (props.mode === 'new') {
        const res = await fetch('/api/district/registration-forms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(props.districtEventId ? { config, districtEventId: props.districtEventId } : { config }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'フォームの作成に失敗しました');
        toast.success('申込フォームを作成しました');
        router.push(`/district/registrations/${data.id}`);
      } else {
        const res = await fetch(`/api/district/registration-forms/${props.formId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '保存に失敗しました');
        if (data.config) setConfig(data.config as RegistrationFormConfig);
        toast.success('設定を保存しました');
        router.refresh();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (props.mode !== 'settings') return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/district/registration-forms/${props.formId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      toast.success('フォームを削除しました');
      router.push('/district/registrations');
    } catch (e) {
      toast.error((e as Error).message);
      setDeleting(false);
    }
  };

  const setFeeMode = (feeMode: FeeMode) => patch({ feeMode });

  return (
    <div className="space-y-4 pb-24">
      {props.mode === 'new' && props.eventTitle && (
        <p className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
          地区行事『{props.eventTitle}』の申込フォームとして作成します
        </p>
      )}
      {/* 基本情報 */}
      <Section title="基本情報" description="申込ページの上部に表示されます。">
        <div>
          <Label htmlFor="title">行事名 <span className="text-red-500">*</span></Label>
          <Input id="title" value={config.title} onChange={e => patch({ title: e.target.value })} placeholder="例：関西四地区 合同交流会" className="mt-1" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="eventDate">開催日</Label>
            <Input id="eventDate" type="date" value={config.eventDate ?? ''} onChange={e => patch({ eventDate: e.target.value || null })} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="venue">会場</Label>
            <Input id="venue" value={config.venue} onChange={e => patch({ venue: e.target.value })} placeholder="例：〇〇ホテル 2F 宴会場" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="deadline">申込締切日</Label>
            <Input id="deadline" type="date" value={config.deadline ?? ''} onChange={e => patch({ deadline: e.target.value || null })} className="mt-1" />
            <p className="mt-1 text-xs text-gray-500">締切日の23:59まで受け付けます</p>
          </div>
          <div>
            <Label htmlFor="paymentDeadline">振込期日</Label>
            <Input id="paymentDeadline" type="date" value={config.paymentDeadline ?? ''} onChange={e => patch({ paymentDeadline: e.target.value || null })} className="mt-1" />
          </div>
        </div>
        <div>
          <Label htmlFor="description">案内文</Label>
          <Textarea
            id="description"
            value={config.description}
            onChange={e => patch({ description: e.target.value })}
            rows={10}
            placeholder={'例：\n日時：〇月〇日（土）13:00〜\n内容：情報交換会・交流会・懇親会\n服装：…'}
            className="mt-1"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact">問い合わせ先</Label>
            <Textarea id="contact" value={config.contact} onChange={e => patch({ contact: e.target.value })} rows={3} placeholder="例：地区幹事 〇〇（090-xxxx-xxxx）" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="bankInfo">振込先</Label>
            <Textarea id="bankInfo" value={config.bankInfo} onChange={e => patch({ bankInfo: e.target.value })} rows={3} placeholder="例：〇〇銀行 〇〇支店 普通 1234567 名義…" className="mt-1" />
          </div>
        </div>
        <div>
          <Label htmlFor="notifyEmail">通知先メールアドレス（任意）</Label>
          <Input id="notifyEmail" type="email" value={config.notifyEmail} onChange={e => patch({ notifyEmail: e.target.value })} placeholder="申込・修正があるたびにお知らせします" className="mt-1" />
          <p className="mt-1 text-xs text-gray-500">申込者には表示されません</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
            checked={config.allowOtherDistricts}
            onChange={e => patch({ allowOtherDistricts: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium text-gray-900">地区外からの申込を受け付ける</span>
            <span className="block text-xs text-gray-500">他地区・ロータリークラブ・学友会などクラブ一覧にない申込を受け付ける</span>
          </span>
        </label>
      </Section>

      {/* 受付状態 */}
      <Section title="受付状態">
        <div className="grid gap-2 sm:grid-cols-3">
          {STATUS_OPTIONS.map(o => (
            <label
              key={o.value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${config.status === o.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
            >
              <input
                type="radio"
                name="status"
                className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
                checked={config.status === o.value}
                onChange={() => patch({ status: o.value })}
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">{o.label}</span>
                <span className="block text-xs text-gray-500">{o.help}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      {registrationCount > 0 && <ChangeWarning count={registrationCount} />}

      {/* 参加枠 */}
      <Section title="参加枠" description="参加者ごとに「どの枠に参加するか」を選んでもらいます（例：情報交換会／交流会／懇親会）。">
        {config.sessions.length === 0 && <p className="text-sm text-gray-500">参加枠がありません。</p>}
        <ul className="space-y-2">
          {config.sessions.map((s, i) => (
            <li key={s.key} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 p-2">
              <div className="min-w-0 flex-1 basis-40">
                <Input value={s.name} onChange={e => patchSession(i, { name: e.target.value })} aria-label={`参加枠${i + 1}の名前`} placeholder="枠の名前" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={s.charged} onChange={e => patchSession(i, { charged: e.target.checked })} />
                料金がかかる
              </label>
              <div className="ml-auto flex gap-1">
                <Button type="button" size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => patch({ sessions: move(config.sessions, i, -1) })} aria-label="上へ">
                  <ArrowUp />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" disabled={i === config.sessions.length - 1} onClick={() => patch({ sessions: move(config.sessions, i, 1) })} aria-label="下へ">
                  <ArrowDown />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" className="text-red-600" onClick={() => patch({ sessions: config.sessions.filter((_, j) => j !== i) })} aria-label="削除">
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={config.sessions.length >= 10}
          onClick={() => patch({ sessions: [...config.sessions, { key: newKey('s'), name: '', charged: true }] })}
        >
          <Plus />
          参加枠を追加
        </Button>
        {config.feeMode === 'per_person' && (
          <p className="text-xs text-gray-500">「料金がかかる」枠に1つでも参加すると、区分ごとの登録料がかかります。</p>
        )}
      </Section>

      {/* 料金 */}
      <Section title="料金">
        <div className="space-y-2">
          {(Object.keys(FEE_MODE_LABELS) as FeeMode[]).map(m => (
            <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${config.feeMode === m ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
              <input type="radio" name="feeMode" className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" checked={config.feeMode === m} onChange={() => setFeeMode(m)} />
              <span className="text-sm text-gray-900">{FEE_MODE_LABELS[m]}</span>
            </label>
          ))}
        </div>
        {config.feeMode === 'per_club' && (
          <div className="max-w-xs">
            <Label htmlFor="clubFee">1クラブ（1申込）あたりの金額（円）</Label>
            <NumberInput id="clubFee" value={config.clubFee} onChange={n => patch({ clubFee: n })} className="mt-1" />
          </div>
        )}
        {config.feeMode === 'per_person' && <p className="text-xs text-gray-500">区分ごとの登録料は下の「区分」で設定します。</p>}

        {/* 料金の例 */}
        <div className="rounded-md bg-gray-50 p-3 text-sm">
          <div className="text-xs font-medium text-gray-500">料金の例</div>
          {config.feeMode === 'per_club' ? (
            <div className="mt-1 text-gray-800">1クラブの申込：<span className="font-semibold">{yen(config.clubFee)}</span>（参加人数にかかわらず）＋物販・協賛</div>
          ) : feeExamples.length === 0 ? (
            <div className="mt-1 text-gray-500">区分を作ると表示されます</div>
          ) : (
            <ul className="mt-1 space-y-0.5 text-gray-800">
              {feeExamples.map(ex => (
                <li key={ex.name}>
                  {ex.name} 1名が全枠参加したとき：<span className="font-semibold">{yen(ex.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* 区分 */}
      <Section title="区分" description="参加者に選んでもらう区分です（例：RC／RAC／OB・OG）。">
        {config.categories.length === 0 && <p className="text-sm text-red-600">区分を1つ以上作ってください。</p>}
        <ul className="space-y-2">
          {config.categories.map((c, i) => (
            <li key={c.key} className="rounded-md border border-gray-200 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 basis-40">
                  <Input value={c.name} onChange={e => patchCategory(i, { name: e.target.value })} aria-label={`区分${i + 1}の名前`} placeholder="区分の名前" />
                </div>
                {config.feeMode === 'per_person' && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-600">登録料</span>
                    <NumberInput value={c.fee} onChange={n => patchCategory(i, { fee: n })} className="w-28" aria-label={`${c.name}の登録料`} />
                    <span className="text-sm text-gray-600">円</span>
                  </div>
                )}
                <div className="ml-auto flex gap-1">
                  <Button type="button" size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => patch({ categories: move(config.categories, i, -1) })} aria-label="上へ">
                    <ArrowUp />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" disabled={i === config.categories.length - 1} onClick={() => patch({ categories: move(config.categories, i, 1) })} aria-label="下へ">
                    <ArrowDown />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" className="text-red-600" onClick={() => patch({ categories: config.categories.filter((_, j) => j !== i) })} aria-label="削除">
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {config.feeMode === 'per_session' && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {config.sessions.length === 0 && <p className="text-xs text-gray-500">参加枠を作ると、枠ごとの料金を設定できます。</p>}
                  {config.sessions.map(s => (
                    <div key={s.key} className="flex items-center gap-1">
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{s.name || '（無題の枠）'}</span>
                      <NumberInput
                        value={c.sessionFees?.[s.key] ?? 0}
                        onChange={n => patchCategory(i, { sessionFees: { ...c.sessionFees, [s.key]: n } })}
                        className="w-28"
                        aria-label={`${c.name}・${s.name}の料金`}
                      />
                      <span className="text-sm text-gray-600">円</span>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={config.categories.length >= 15}
          onClick={() => patch({ categories: [...config.categories, { key: newKey('c'), name: '', fee: 0, sessionFees: {} }] })}
        >
          <Plus />
          区分を追加
        </Button>
      </Section>

      {/* 物販・協賛 */}
      <Section title="物販・協賛" description="グッズの購入や協賛の申込を一緒に受け付けます（不要なら空のままで構いません）。">
        {config.items.length === 0 && <p className="text-sm text-gray-500">物販・協賛の項目はありません。</p>}
        <ul className="space-y-3">
          {config.items.map((item, i) => (
            <li key={item.key} className="space-y-3 rounded-md border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 basis-40">
                  <Input value={item.name} onChange={e => patchItem(i, { name: e.target.value })} aria-label={`項目${i + 1}の名前`} placeholder="例：オリジナルマフラータオル" />
                </div>
                <Button type="button" size="icon-sm" variant="ghost" className="ml-auto text-red-600" onClick={() => patch({ items: config.items.filter((_, j) => j !== i) })} aria-label="削除">
                  <Trash2 />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  { v: 'quantity', l: '数量で申し込む', h: '例：タオル 2,000円／枚' },
                  { v: 'named', l: '1件ごとに種類と記載名', h: '例：ペナント協賛 個人／法人' },
                ] as const).map(k => (
                  <label key={k.v} className={`flex flex-1 basis-48 cursor-pointer items-start gap-2 rounded-md border p-2 ${item.kind === k.v ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <input
                      type="radio"
                      name={`kind-${item.key}`}
                      className="mt-0.5 h-4 w-4 accent-blue-600"
                      checked={item.kind === k.v}
                      onChange={() =>
                        patchItem(i, {
                          kind: k.v,
                          options: k.v === 'named' && item.options.length === 0 ? [{ key: newKey('o'), label: '', price: 0 }] : item.options,
                        })
                      }
                    />
                    <span>
                      <span className="block text-sm text-gray-900">{k.l}</span>
                      <span className="block text-xs text-gray-500">{k.h}</span>
                    </span>
                  </label>
                ))}
              </div>
              {item.kind === 'quantity' ? (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-600">単価</span>
                  <NumberInput value={item.price} onChange={n => patchItem(i, { price: n })} className="w-32" aria-label={`${item.name}の単価`} />
                  <span className="text-sm text-gray-600">円</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500">種類と金額</div>
                  {item.options.map((o, oi) => (
                    <div key={o.key} className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 basis-32">
                        <Input
                          value={o.label}
                          placeholder="例：個人"
                          aria-label="種類"
                          onChange={e => patchItem(i, { options: item.options.map((x, j) => (j === oi ? { ...x, label: e.target.value } : x)) })}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <NumberInput
                          value={o.price}
                          onChange={n => patchItem(i, { options: item.options.map((x, j) => (j === oi ? { ...x, price: n } : x)) })}
                          className="w-28"
                          aria-label="金額"
                        />
                        <span className="text-sm text-gray-600">円</span>
                      </div>
                      <Button type="button" size="icon-sm" variant="ghost" className="text-red-600" onClick={() => patchItem(i, { options: item.options.filter((_, j) => j !== oi) })} aria-label="種類を削除">
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={item.options.length >= 10}
                    onClick={() => patchItem(i, { options: [...item.options, { key: newKey('o'), label: '', price: 0 }] })}
                  >
                    <Plus />
                    種類を追加
                  </Button>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={item.requireLabel} onChange={e => patchItem(i, { requireLabel: e.target.checked })} />
                    「記載名」（ペナントに載せる名前など）を必須にする
                  </label>
                </div>
              )}
              <div>
                <Label className="text-xs text-gray-500">説明（申込ページに表示）</Label>
                <Input value={item.description} onChange={e => patchItem(i, { description: e.target.value })} placeholder="例：記載する名前（企業名・クラブ名など）を入れてください" className="mt-1" />
              </div>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={config.items.length >= 10}
          onClick={() =>
            patch({
              items: [...config.items, { key: newKey('i'), name: '', kind: 'quantity', price: 0, options: [], requireLabel: false, description: '' }],
            })
          }
        >
          <Plus />
          物販・協賛の項目を追加
        </Button>
      </Section>

      {/* 参加者の入力項目 */}
      <Section title="参加者の入力項目" description="氏名・区分・参加枠は必ず入力してもらいます。そのほかに聞く項目を選んでください。">
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { k: 'kana', l: 'フリガナ' },
            { k: 'position', l: '役職' },
            { k: 'club', l: '参加者ごとの所属クラブ', h: 'RCの方などをまとめて申し込む場合' },
            { k: 'under20', l: '20歳未満かどうか', h: '懇親会での飲酒確認などに' },
          ] as const).map(f => (
            <label key={f.k} className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
                checked={config.attendeeFields[f.k]}
                onChange={e => patch({ attendeeFields: { ...config.attendeeFields, [f.k]: e.target.checked } })}
              />
              <span>
                <span className="block text-sm text-gray-900">{f.l}</span>
                {'h' in f && <span className="block text-xs text-gray-500">{f.h}</span>}
              </span>
            </label>
          ))}
        </div>
        <div>
          <Label htmlFor="noteLabel">備考欄の見出し</Label>
          <Input
            id="noteLabel"
            value={config.attendeeFields.noteLabel}
            onChange={e => patch({ attendeeFields: { ...config.attendeeFields, noteLabel: e.target.value } })}
            placeholder="例：備考（アレルギー・遅参など）"
            className="mt-1"
          />
        </div>
      </Section>

      {/* 削除（設定画面のみ） */}
      {props.mode === 'settings' && (
        <Card className="border-red-200 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-red-700">フォームの削除</h2>
          <p className="mt-1 text-sm text-gray-600">
            申込ページが使えなくなり、一覧からも消えます。{registrationCount > 0 && `申込済みの${registrationCount}件のデータは記録として残りますが、この画面からは見られなくなります。`}
          </p>
          <Button type="button" variant="destructive" size="sm" className="mt-3" onClick={() => setDeleteOpen(true)}>
            <Trash2 />
            このフォームを削除する
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>フォームを削除しますか？</DialogTitle>
                <DialogDescription>
                  「{config.title}」を削除します。{registrationCount > 0 ? `${registrationCount}件の申込があります。` : ''}この操作は画面からは元に戻せません。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                  やめる
                </Button>
                <Button variant="destructive" onClick={remove} loading={deleting}>
                  削除する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      )}

      {/* 保存ボタン（画面下に固定） */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur md:left-auto md:right-6 md:bottom-6 md:rounded-lg md:border md:shadow-lg">
        <div className="flex gap-2">
          {props.mode === 'new' ? (
            <Button type="button" variant="outline" onClick={() => {
                if (window.confirm('入力した内容を破棄して、ひな形を選び直しますか？')) setConfig(null);
              }} disabled={saving}>
              <ArrowLeft />
              ひな形を選び直す
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={`/district/registrations/${props.formId}`}>
                <ArrowLeft />
                管理画面へ
              </Link>
            </Button>
          )}
          <Button type="button" onClick={save} loading={saving} className="flex-1 md:flex-none">
            {isNew ? 'フォームを作成する' : '設定を保存する'}
          </Button>
        </div>
      </div>
    </div>
  );
}
