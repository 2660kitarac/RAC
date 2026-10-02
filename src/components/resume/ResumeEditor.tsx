'use client';

/**
 * 例会レジュメの編集画面
 *
 * タブ構成
 *  1. 内容       … 見出し・プログラム・ビジター紹介・幹事連絡（この例会だけ）
 *  2. 会員名簿   … 写真・ローマ字・委員会・勤務先・出欠（クラブ共通で次回以降も使う）
 *  3. クラブ設定 … ヘッダー表記・提唱クラブ・ロゴ・国歌/ソング（クラブ共通）
 */
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Camera, Eye, EyeOff, FileText, ImagePlus, Plus, Printer, RotateCcw, Save, Trash2, Users, Settings,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  VISITOR_CATEGORY_LABELS,
  type ClubResumeSettings,
  type MemberMark,
  type MemberProfileInput,
  type ResumeData,
  type ResumeView,
  type VisitorCategory,
} from '@/lib/resume/types';
import { districtHeading } from '@/lib/resume/format';

// ─── 画像の縮小 ─────────────────────────────────────────
async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    r.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = url;
  });
}

/** 顔写真：縦長（3:3.5）に中央で切り抜き、JPEG で軽くする */
async function toPhotoDataUrl(file: File): Promise<string> {
  const img = await loadImage(file);
  const W = 300;
  const H = 350;
  const target = W / H;
  const srcRatio = img.width / img.height;
  let sw = img.width;
  let sh = img.height;
  if (srcRatio > target) sw = img.height * target;
  else sh = img.width / target;
  const sx = (img.width - sw) / 2;
  // 顔が上寄りの写真が多いので、縦方向は少し上から切り抜く
  const sy = Math.max(0, (img.height - sh) * 0.3);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像処理に失敗しました');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  return canvas.toDataURL('image/jpeg', 0.82);
}

/** ロゴ：長辺 480px に縮小し、透過を残すため PNG */
async function toLogoDataUrl(file: File): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(1, 480 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像処理に失敗しました');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL('image/png');
  if (png.length <= 380_000) return png;
  // 写真のようなロゴは PNG だと重くなるため、白背景の JPEG にする
  const bg = document.createElement('canvas');
  bg.width = canvas.width;
  bg.height = canvas.height;
  const bctx = bg.getContext('2d');
  if (!bctx) throw new Error('画像処理に失敗しました');
  bctx.fillStyle = '#fff';
  bctx.fillRect(0, 0, bg.width, bg.height);
  bctx.drawImage(canvas, 0, 0);
  return bg.toDataURL('image/jpeg', 0.85);
}

function checkImageFile(file: File): string | null {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return 'PNG / JPEG / WebP の画像を選んでください';
  if (file.size > 10 * 1024 * 1024) return '画像は10MB以下にしてください';
  return null;
}

const CATEGORY_OPTIONS: VisitorCategory[] = ['rc', 'district', 'rac', 'other'];
const MARK_OPTIONS: Array<{ value: '' | MemberMark; label: string }> = [
  { value: '', label: '自動' },
  { value: 'present', label: '○ 出席' },
  { value: 'absent', label: '× 欠席' },
  { value: 'none', label: '− 未回答' },
];
const MARK_SYMBOL: Record<MemberMark, string> = { present: '○', absent: '×', none: '−' };

function profilesFromView(v: ResumeView): Record<string, MemberProfileInput> {
  return Object.fromEntries(
    v.members.map(m => [
      m.userId,
      { userId: m.userId, nameEn: m.nameEn, committee: m.committee, company: m.companySaved, photoUrl: m.photoUrl },
    ]),
  );
}

const selectClass =
  'h-10 w-full rounded-md border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function newId() {
  return `extra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function ResumeEditor({ initialView }: { initialView: ResumeView }) {
  const router = useRouter();
  const [view, setView] = useState<ResumeView>(initialView);
  const [data, setData] = useState<ResumeData>(initialView.data ?? {});
  const [settings, setSettings] = useState<ClubResumeSettings>(initialView.settings);
  const [profiles, setProfiles] = useState<Record<string, MemberProfileInput>>(() => profilesFromView(initialView));
  const [dirtyData, setDirtyData] = useState(false);
  const [dirtySettings, setDirtySettings] = useState(false);
  const [dirtyProfiles, setDirtyProfiles] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const isDirty = dirtyData || dirtySettings || dirtyProfiles.size > 0;
  const districtLabel = districtHeading(view.club.district);

  // ─── 更新ヘルパー ───
  const patchData = (patch: Partial<ResumeData>) => {
    setData(prev => ({ ...prev, ...patch }));
    setDirtyData(true);
  };
  const patchSettings = (patch: Partial<ClubResumeSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
    setDirtySettings(true);
  };
  const patchProfile = (userId: string, patch: Partial<MemberProfileInput>) => {
    setProfiles(prev => {
      // 保存後に名簿へ加わった人でも userId が欠けないよう、空の値から組み立てる
      const base: MemberProfileInput = prev[userId] ?? { userId, nameEn: '', committee: '', company: '', photoUrl: null };
      return { ...prev, [userId]: { ...base, ...patch, userId } };
    });
    setDirtyProfiles(prev => new Set(prev).add(userId));
  };

  const programText = useMemo(
    () => (data.programItems && data.programItems.length > 0 ? data.programItems.join('\n') : ''),
    [data.programItems],
  );

  // ─── 保存 ───
  const save = async (): Promise<boolean> => {
    if (view.tablesMissing) {
      toast.error('データベースの準備が済んでいないため保存できません（管理者にお問い合わせください）');
      return false;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (dirtyData) body.data = data;
      if (dirtySettings) body.settings = settings;
      if (dirtyProfiles.size > 0) body.profiles = Array.from(dirtyProfiles).map(id => profiles[id]);
      if (Object.keys(body).length === 0) return true;

      const res = await fetch(`/api/meetings/${view.meeting.id}/resume`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '保存に失敗しました');
      const next: ResumeView = json.resume;
      setView(next);
      setData(next.data ?? {});
      setSettings(next.settings);
      setProfiles(profilesFromView(next));
      setDirtyData(false);
      setDirtySettings(false);
      setDirtyProfiles(new Set());
      toast.success('レジュメを保存しました');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openPrint = async () => {
    // 保存できない環境（テーブル未作成）でも、確認のために印刷画面へは進める
    const ok = view.tablesMissing || !isDirty ? true : await save();
    if (ok) router.push(`/meetings/${view.meeting.id}/resume/print`);
  };

  // ─── 画像 ───
  const handlePhoto = async (userId: string, file: File | undefined) => {
    if (!file) return;
    const err = checkImageFile(file);
    if (err) return toast.error(err);
    setProcessingPhoto(userId);
    try {
      patchProfile(userId, { photoUrl: await toPhotoDataUrl(file) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '画像の処理に失敗しました');
    } finally {
      setProcessingPhoto(null);
    }
  };

  const handleLogo = async (file: File | undefined) => {
    if (!file) return;
    const err = checkImageFile(file);
    if (err) return toast.error(err);
    try {
      patchSettings({ logoUrl: await toLogoDataUrl(file) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '画像の処理に失敗しました');
    }
  };

  // ─── ビジター ───
  const autoVisitors = view.visitors.filter(v => v.attendanceId);
  const overrides = data.visitorOverrides ?? {};
  const extras = data.extraVisitors ?? [];
  const setOverride = (id: string, patch: Record<string, unknown>) =>
    patchData({ visitorOverrides: { ...overrides, [id]: { ...(overrides[id] ?? {}), ...patch } } });

  const nmOverrides = data.nextMeetingOverrides ?? {};
  const setNm = (id: string, patch: Record<string, unknown>) =>
    patchData({ nextMeetingOverrides: { ...nmOverrides, [id]: { ...(nmOverrides[id] ?? {}), ...patch } } });

  const markOverrides = data.memberMarkOverrides ?? {};
  const setMark = (userId: string, value: '' | MemberMark) => {
    const next = { ...markOverrides };
    if (value) next[userId] = value;
    else delete next[userId];
    patchData({ memberMarkOverrides: next });
  };

  return (
    <div className="space-y-4 pb-24 sm:pb-0">
      {/* 見出し */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/meetings/${view.meeting.id}`}
            className="mb-1 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4" /> 例会詳細へ戻る
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
            <FileText className="h-5 w-5 flex-shrink-0 text-blue-600" />
            レジュメ作成
          </h1>
          <p className="mt-0.5 break-words text-sm text-gray-500">{view.headerLine}</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <Button variant="outline" onClick={save} loading={saving} disabled={!isDirty}>
            <Save className="h-4 w-4" /> 保存
          </Button>
          <Button onClick={openPrint} disabled={saving}>
            <Printer className="h-4 w-4" /> 保存して印刷・PDF
          </Button>
        </div>
      </div>

      {view.tablesMissing && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          レジュメ用のデータベースがまだ準備されていません。表示の確認はできますが、保存はできません。
          管理者が <code className="rounded bg-amber-100 px-1">migrations/0011_meeting_resume.sql</code> を適用すると使えるようになります。
        </div>
      )}

      <fieldset disabled={saving} className="min-w-0 disabled:opacity-80">
      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content"><FileText className="mr-1 h-4 w-4" />内容</TabsTrigger>
          <TabsTrigger value="members"><Users className="mr-1 h-4 w-4" />会員名簿</TabsTrigger>
          <TabsTrigger value="club"><Settings className="mr-1 h-4 w-4" />クラブ設定</TabsTrigger>
        </TabsList>

        {/* ================= 内容 ================= */}
        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">見出し</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>年度</Label>
                <Input value={data.yearLabel ?? ''} placeholder={view.defaults.yearLabel}
                  onChange={e => patchData({ yearLabel: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>回次</Label>
                <Input value={data.sessionLabel ?? ''} placeholder={view.defaults.sessionLabel}
                  onChange={e => patchData({ sessionLabel: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>大見出し（例会テーマ）</Label>
                <Input value={data.title ?? ''} placeholder={view.defaults.title}
                  onChange={e => patchData({ title: e.target.value })} />
              </div>
              <p className="text-xs text-gray-500 sm:col-span-3">
                空欄のときは薄い文字の内容（例会の情報から自動）が入ります。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">本日のプログラム</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => patchData({ programItems: [] })}>
                <RotateCcw className="h-4 w-4" /> 標準に戻す
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={9}
                value={programText}
                placeholder={view.defaults.programItems.join('\n')}
                onChange={e => patchData({ programItems: e.target.value.split('\n') })}
              />
              <p className="text-xs text-gray-500">1行に1項目。番号は自動で付きます。</p>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" className="h-5 w-5 flex-shrink-0" checked={data.showSongs !== false}
                  onChange={e => patchData({ showSongs: e.target.checked })} />
                国歌・ソングの歌詞を載せる（本文は「クラブ設定」で登録）
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ビジター紹介</CardTitle>
              <p className="text-xs text-gray-500">
                MU登録された方が自動で並びます。区分・役職の直しや、載せない設定ができます。
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {autoVisitors.length === 0 && extras.length === 0 && (
                <p className="text-sm text-gray-500">この例会のMU登録はまだありません。</p>
              )}

              {autoVisitors.map(base => {
                // 保存前の編集内容を重ねて表示する
                const o = overrides[base.key] ?? {};
                const v = {
                  ...base,
                  category: o.category ?? base.category,
                  clubName: o.clubName ?? base.clubName,
                  position: o.position ?? base.position,
                  name: o.name ?? base.name,
                  hidden: o.hidden ?? base.hidden,
                };
                return (
                <div key={v.key} className={cn('rounded-lg border p-3', v.hidden && 'bg-gray-50 opacity-60')}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr_1fr_1fr_auto] sm:items-center">
                    <select className={selectClass} value={v.category}
                      onChange={e => setOverride(v.key, { category: e.target.value })}>
                      {CATEGORY_OPTIONS.map(c => (
                        <option key={c} value={c}>{c === 'district' ? districtLabel : VISITOR_CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                    <Input aria-label="所属" value={v.clubName} placeholder="所属クラブ"
                      onChange={e => setOverride(v.key, { clubName: e.target.value })} />
                    <Input aria-label="役職" value={v.position} placeholder="役職"
                      onChange={e => setOverride(v.key, { position: e.target.value })} />
                    <Input aria-label="氏名" value={v.name} placeholder="氏名"
                      onChange={e => setOverride(v.key, { name: e.target.value })} />
                    <Button variant="outline" size="sm" onClick={() => setOverride(v.key, { hidden: !v.hidden })}>
                      {v.hidden ? <><Eye className="h-4 w-4" />載せる</> : <><EyeOff className="h-4 w-4" />載せない</>}
                    </Button>
                  </div>
                </div>
                );
              })}

              {extras.map((v, i) => (
                <div key={v.id} className="rounded-lg border border-dashed p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr_1fr_1fr_auto] sm:items-center">
                    <select className={selectClass} value={v.category}
                      onChange={e => {
                        const next = [...extras];
                        next[i] = { ...v, category: e.target.value as VisitorCategory };
                        patchData({ extraVisitors: next });
                      }}>
                      {CATEGORY_OPTIONS.map(c => (
                        <option key={c} value={c}>{c === 'district' ? districtLabel : VISITOR_CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                    {(['clubName', 'position', 'name'] as const).map(field => (
                      <Input key={field} value={v[field]}
                        placeholder={field === 'clubName' ? '所属クラブ' : field === 'position' ? '役職' : '氏名'}
                        onChange={e => {
                          const next = [...extras];
                          next[i] = { ...v, [field]: e.target.value };
                          patchData({ extraVisitors: next });
                        }} />
                    ))}
                    <Button variant="ghost" size="sm" className="text-red-600"
                      onClick={() => patchData({ extraVisitors: extras.filter(x => x.id !== v.id) })}>
                      <Trash2 className="h-4 w-4" /> 削除
                    </Button>
                  </div>
                </div>
              ))}

              <Button variant="outline" className="w-full sm:w-auto"
                onClick={() => patchData({
                  extraVisitors: [...extras, { id: newId(), category: 'rc', clubName: '', position: '', name: '' }],
                })}>
                <Plus className="h-4 w-4" /> ビジターを手で追加
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">幹事連絡</CardTitle>
              <p className="text-xs text-gray-500">今後の例会が自動で入ります。件数を変えたら「保存」で反映されます。</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">載せる件数</Label>
                <select className={cn(selectClass, 'w-24')} value={data.nextMeetingCount ?? 2}
                  onChange={e => patchData({ nextMeetingCount: Number(e.target.value) })}>
                  {[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}件</option>)}
                </select>
              </div>

              {view.nextMeetings.map(base => {
                const n = { ...base, hidden: nmOverrides[base.id]?.hidden ?? base.hidden };
                return (
                <div key={n.id} className={cn('space-y-2 rounded-lg border p-3', n.hidden && 'bg-gray-50 opacity-60')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800">{n.label}　{n.dateLabel}</p>
                    <Button variant="outline" size="sm" onClick={() => setNm(n.id, { hidden: !n.hidden })}>
                      {n.hidden ? <><Eye className="h-4 w-4" />載せる</> : <><EyeOff className="h-4 w-4" />載せない</>}
                    </Button>
                  </div>
                  <Input value={nmOverrides[n.id]?.title ?? ''} placeholder={n.autoTitle}
                    onChange={e => setNm(n.id, { title: e.target.value })} />
                  <Textarea rows={2} value={nmOverrides[n.id]?.content ?? ''} placeholder={n.autoContent || '【内容】に載せる文'}
                    onChange={e => setNm(n.id, { content: e.target.value })} />
                </div>
                );
              })}

              <div className="space-y-1.5">
                <Label>その他の連絡（自由記入）</Label>
                <Textarea rows={3} value={data.secretaryNote ?? ''}
                  placeholder="例：次回の集合時間の変更、会費の納入のお願い など"
                  onChange={e => patchData({ secretaryNote: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= 会員名簿 ================= */}
        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">会員名簿（{view.members.length}名）</CardTitle>
              <p className="text-xs text-gray-500">
                写真・ローマ字・委員会・勤務先はクラブ共通で保存され、次回以降のレジュメにもそのまま使われます。
                役職は「会員管理」の役職が表示されます。
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" className="h-5 w-5 flex-shrink-0" checked={data.showAttendance !== false}
                  onChange={e => patchData({ showAttendance: e.target.checked })} />
                名簿に出欠（○ ×）と出席率を載せる
              </label>
            </CardHeader>
            <CardContent className="space-y-3">
              {view.members.length === 0 && (
                <p className="text-sm text-gray-500">名簿に載せる会員がいません（会員管理で在籍中の会員を確認してください）。</p>
              )}
              {view.members.map(m => {
                const p = profiles[m.userId];
                const override = markOverrides[m.userId] ?? '';
                return (
                  <div key={m.userId} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row">
                    {/* 写真 */}
                    <div className="flex items-center gap-3 sm:w-32 sm:flex-col sm:items-start">
                      {p?.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoUrl} alt="" className="h-24 w-20 flex-shrink-0 rounded-md object-cover" />
                      ) : (
                        <div className="flex h-24 w-20 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-2xl font-bold text-gray-400">
                          {m.name.slice(0, 1)}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                          <Camera className="h-3.5 w-3.5" />
                          {processingPhoto === m.userId ? '処理中…' : p?.photoUrl ? '変更' : '写真'}
                          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                            onChange={e => { handlePhoto(m.userId, e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                        {p?.photoUrl && (
                          <Button variant="ghost" size="sm" className="text-red-600"
                            onClick={() => patchProfile(m.userId, { photoUrl: null })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 項目 */}
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <p className="font-semibold text-gray-900">
                          {m.name}
                          {m.position && (
                            <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-800">{m.position}</span>
                          )}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">ローマ字</Label>
                        <Input value={p?.nameEn ?? ''} placeholder="Furukawa Hironobu" autoCapitalize="words"
                          onChange={e => patchProfile(m.userId, { nameEn: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">委員会</Label>
                        <Input value={p?.committee ?? ''} placeholder="例：社会奉仕委員長"
                          onChange={e => patchProfile(m.userId, { committee: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">勤務先・学校{m.occupation && '（空欄なら会員情報の値）'}</Label>
                        <Input value={p?.company ?? ''} placeholder={m.occupation || '株式会社〇〇'}
                          onChange={e => patchProfile(m.userId, { company: e.target.value })} />
                      </div>
                      {data.showAttendance !== false && (
                        <div className="space-y-1">
                          <Label className="text-xs">出欠（自動：{MARK_SYMBOL[m.autoMark]}）</Label>
                          <select className={selectClass} value={override}
                            onChange={e => setMark(m.userId, e.target.value as '' | MemberMark)}>
                            {MARK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= クラブ設定 ================= */}
        <TabsContent value="club" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ヘッダー</CardTitle>
              <p className="text-xs text-gray-500">クラブ共通の設定です。すべての例会のレジュメに使われます。</p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>1行目の表記</Label>
                <Input value={settings.headerLabel} onChange={e => patchSettings({ headerLabel: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>提唱クラブ</Label>
                <Input value={settings.sponsorName} placeholder="例：大阪北ロータリークラブ"
                  onChange={e => patchSettings({ sponsorName: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>ロゴ・画像（右上に表示）</Label>
                <div className="flex flex-wrap items-center gap-3">
                  {settings.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={settings.logoUrl} alt="" className="h-16 max-w-[12rem] rounded border object-contain p-1" />
                  ) : (
                    <div className="flex h-16 w-28 items-center justify-center rounded border border-dashed text-xs text-gray-400">未設定</div>
                  )}
                  <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" /> 画像を選ぶ
                  </Button>
                  {settings.logoUrl && (
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => patchSettings({ logoUrl: null })}>
                      <Trash2 className="h-4 w-4" /> 外す
                    </Button>
                  )}
                  <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={e => { handleLogo(e.target.files?.[0]); e.target.value = ''; }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">国歌・ソング</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>国歌の見出し</Label>
                <Input value={settings.anthemTitle} onChange={e => patchSettings({ anthemTitle: e.target.value })} />
                <Textarea rows={4} value={settings.anthemText} onChange={e => patchSettings({ anthemText: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>ソングの見出し</Label>
                <Input value={settings.songTitle} onChange={e => patchSettings({ songTitle: e.target.value })} />
                <Textarea rows={7} value={settings.songText} placeholder="クラブで使っている歌詞を貼り付けてください（空欄なら載りません）"
                  onChange={e => patchSettings({ songText: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </fieldset>

      {/* スマホ：保存と印刷を画面下に固定 */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-white/95 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur sm:hidden">
        <Button variant="outline" className="flex-1" onClick={save} loading={saving} disabled={!isDirty}>
          <Save className="h-4 w-4" /> 保存
        </Button>
        <Button className="flex-1" onClick={openPrint} disabled={saving}>
          <Printer className="h-4 w-4" /> 印刷・PDF
        </Button>
      </div>
    </div>
  );
}
