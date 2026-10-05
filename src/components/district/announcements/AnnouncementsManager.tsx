'use client';

/**
 * 地区からのお知らせの一覧・作成・編集（地区役員用）
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Eye, Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { DistrictAnnouncementItem } from '@/components/dashboard/DistrictAnnouncements';
import {
  ANNOUNCEMENT_AUDIENCE_LABELS,
  ANNOUNCEMENT_LEVEL_LABELS,
  ANNOUNCEMENT_LEVEL_STYLES,
  ANNOUNCEMENT_LIMITS,
  PUBLISH_STATE_LABELS,
  publishState,
  safeHttpUrl,
  sortAnnouncements,
  type AnnouncementAudience,
  type AnnouncementLevel,
  type AnnouncementView,
  type PublishState,
} from '@/lib/district/announcements';
import { cn } from '@/lib/utils';

type Filter = 'all' | PublishState;

type FormState = {
  title: string;
  body: string;
  level: AnnouncementLevel;
  audience: AnnouncementAudience;
  publishFrom: string;
  publishUntil: string;
  pinned: boolean;
  linkUrl: string;
  linkLabel: string;
};

const STATE_BADGE: Record<PublishState, string> = {
  published: 'bg-green-100 text-green-700',
  scheduled: 'bg-sky-100 text-sky-700',
  ended: 'bg-gray-100 text-gray-500',
};

function emptyForm(today: string): FormState {
  return {
    title: '', body: '', level: 'info', audience: 'all',
    publishFrom: today, publishUntil: '', pinned: false, linkUrl: '', linkLabel: '',
  };
}

function periodText(a: { publishFrom: string | null; publishUntil: string | null }): string {
  const f = (d: string | null) => (d ? d.replaceAll('-', '/') : '');
  if (!a.publishFrom && !a.publishUntil) return '期限なし';
  return `${f(a.publishFrom) || '今すぐ'} 〜 ${f(a.publishUntil) || '期限なし'}`;
}

export default function AnnouncementsManager({
  initialAnnouncements,
  today,
}: {
  initialAnnouncements: AnnouncementView[];
  today: string;
}) {
  const [items, setItems] = useState<AnnouncementView[]>(initialAnnouncements);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<AnnouncementView | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(today));
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const counts = useMemo(() => {
    const c: Record<PublishState, number> = { published: 0, scheduled: 0, ended: 0 };
    items.forEach(a => { c[publishState(a, today)]++; });
    return c;
  }, [items, today]);

  const filtered = items.filter(a => filter === 'all' || publishState(a, today) === filter);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(today));
    setShowPreview(false);
    setDialogOpen(true);
  };

  const openEdit = (a: AnnouncementView) => {
    setEditing(a);
    setForm({
      title: a.title, body: a.body, level: a.level, audience: a.audience,
      publishFrom: a.publishFrom ?? '', publishUntil: a.publishUntil ?? '', pinned: a.pinned,
      linkUrl: a.linkUrl ?? '', linkLabel: a.linkLabel ?? '',
    });
    setShowPreview(false);
    setDialogOpen(true);
  };

  const validate = (): string | null => {
    if (!form.title.trim()) return 'タイトルを入力してください';
    if (form.title.trim().length > ANNOUNCEMENT_LIMITS.title) return `タイトルは${ANNOUNCEMENT_LIMITS.title}文字以内で入力してください`;
    if (form.body.length > ANNOUNCEMENT_LIMITS.body) return `本文は${ANNOUNCEMENT_LIMITS.body}文字以内で入力してください`;
    if (form.linkUrl.trim() && !safeHttpUrl(form.linkUrl)) return 'リンクは http:// または https:// で始まるURLを入力してください';
    if (form.publishFrom && form.publishUntil && form.publishUntil < form.publishFrom) return '掲載終了日は掲載開始日より後の日付にしてください';
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        publishFrom: form.publishFrom || null,
        publishUntil: form.publishUntil || null,
        linkUrl: form.linkUrl.trim() || null,
        linkLabel: form.linkLabel.trim() || null,
      };
      const res = await fetch(editing ? `/api/district/announcements/${editing.id}` : '/api/district/announcements', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');
      const saved = data.announcement as AnnouncementView | null;
      if (saved) {
        setItems(prev => sortAnnouncements(editing ? prev.map(a => (a.id === saved.id ? saved : a)) : [saved, ...prev]));
      }
      toast.success(editing ? 'お知らせを更新しました' : 'お知らせを作成しました');
      setDialogOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/district/announcements/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      setItems(prev => prev.filter(a => a.id !== deleteTarget.id));
      toast.success('お知らせを削除しました');
      setDeleteTarget(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const previewItem = {
    title: form.title || '（タイトル）',
    body: form.body,
    level: form.level,
    linkUrl: safeHttpUrl(form.linkUrl),
    linkLabel: form.linkLabel || null,
    pinned: form.pinned,
    publishFrom: form.publishFrom || null,
    createdAt: today,
  };

  const filterButtons: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'すべて', count: items.length },
    { key: 'published', label: PUBLISH_STATE_LABELS.published, count: counts.published },
    { key: 'scheduled', label: PUBLISH_STATE_LABELS.scheduled, count: counts.scheduled },
    { key: 'ended', label: PUBLISH_STATE_LABELS.ended, count: counts.ended },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="掲載状態で絞り込む">
          {filterButtons.map(b => (
            <button
              key={b.key}
              type="button"
              role="tab"
              aria-selected={filter === b.key}
              onClick={() => setFilter(b.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                filter === b.key
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              {b.label}（{b.count}）
            </button>
          ))}
        </div>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4" />お知らせを作成
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-gray-500">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          {items.length === 0 ? (
            <>
              <p className="font-medium text-gray-700">まだお知らせはありません</p>
              <p className="mt-1 text-sm">「お知らせを作成」から、各クラブへの連絡を配信できます。</p>
            </>
          ) : (
            <p>この条件に当てはまるお知らせはありません</p>
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map(a => {
            const st = publishState(a, today);
            const lv = ANNOUNCEMENT_LEVEL_STYLES[a.level];
            return (
              <li key={a.id}>
                <Card className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', STATE_BADGE[st])}>{PUBLISH_STATE_LABELS[st]}</span>
                        <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', lv.badge)}>{ANNOUNCEMENT_LEVEL_LABELS[a.level]}</span>
                        {a.pinned && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                            <Pin className="h-3 w-3" />上部に固定
                          </span>
                        )}
                        {a.audience === 'officers' && (
                          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">クラブ役員のみ</span>
                        )}
                      </div>
                      <p className="mt-1.5 break-words font-semibold text-gray-900">{a.title}</p>
                      {a.body && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-gray-600">{a.body}</p>}
                      <p className="mt-1.5 text-xs text-gray-500">掲載期間：{periodText(a)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                        <Pencil className="h-3.5 w-3.5" />編集
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(a)}>
                        <Trash2 className="h-3.5 w-3.5" />削除
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* 作成・編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={o => !saving && setDialogOpen(o)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'お知らせを編集' : 'お知らせを作成'}</DialogTitle>
            <DialogDescription>掲載期間中、各クラブのダッシュボード上部に表示されます。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title" required>タイトル</Label>
              <Input id="ann-title" value={form.title} maxLength={ANNOUNCEMENT_LIMITS.title}
                onChange={e => set('title', e.target.value)} placeholder="例：地区大会の出欠締切は10月20日です" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-body">本文</Label>
              <Textarea id="ann-body" rows={6} value={form.body} maxLength={ANNOUNCEMENT_LIMITS.body}
                onChange={e => set('body', e.target.value)} placeholder="改行もそのまま表示されます" />
              <p className="text-right text-xs text-gray-400">{form.body.length} / {ANNOUNCEMENT_LIMITS.body}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ann-level">重要度</Label>
                <select id="ann-level" value={form.level} onChange={e => set('level', e.target.value as AnnouncementLevel)}
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
                  {(Object.keys(ANNOUNCEMENT_LEVEL_LABELS) as AnnouncementLevel[]).map(k => (
                    <option key={k} value={k}>{ANNOUNCEMENT_LEVEL_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-audience">表示する相手</Label>
                <select id="ann-audience" value={form.audience} onChange={e => set('audience', e.target.value as AnnouncementAudience)}
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
                  {(Object.keys(ANNOUNCEMENT_AUDIENCE_LABELS) as AnnouncementAudience[]).map(k => (
                    <option key={k} value={k}>{ANNOUNCEMENT_AUDIENCE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-from">掲載開始日</Label>
                <Input id="ann-from" type="date" value={form.publishFrom} onChange={e => set('publishFrom', e.target.value)} />
                <p className="text-xs text-gray-500">空欄なら今すぐ掲載</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-until">掲載終了日</Label>
                <Input id="ann-until" type="date" value={form.publishUntil} onChange={e => set('publishUntil', e.target.value)} />
                <p className="text-xs text-gray-500">空欄なら期限なし（この日まで表示）</p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={form.pinned} onChange={e => set('pinned', e.target.checked)} className="h-4 w-4 rounded" />
              <span className="text-sm">上部に固定する（ほかのお知らせより先に表示）</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ann-url">リンク（任意）</Label>
                <Input id="ann-url" type="url" inputMode="url" value={form.linkUrl}
                  onChange={e => set('linkUrl', e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-label">リンクの表示名</Label>
                <Input id="ann-label" value={form.linkLabel} maxLength={ANNOUNCEMENT_LIMITS.linkLabel}
                  onChange={e => set('linkLabel', e.target.value)} placeholder="例：申込フォームはこちら" disabled={!form.linkUrl.trim()} />
              </div>
            </div>

            <div>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowPreview(p => !p)}>
                <Eye className="h-3.5 w-3.5" />{showPreview ? 'プレビューを閉じる' : 'クラブ側での見え方を確認'}
              </Button>
              {showPreview && (
                <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
                  <p className="mb-2 text-xs text-gray-500">
                    クラブのダッシュボードではこのように表示されます
                    {form.audience === 'officers' && '（個人会員には表示されません）'}
                  </p>
                  <ul><DistrictAnnouncementItem a={previewItem} /></ul>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>キャンセル</Button>
            <Button onClick={save} loading={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {editing ? '更新する' : '作成する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認 */}
      <Dialog open={!!deleteTarget} onOpenChange={o => !o && !deleting && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>お知らせを削除しますか？</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.title}」を削除すると、クラブのダッシュボードにも表示されなくなります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>キャンセル</Button>
            <Button variant="destructive" onClick={remove} loading={deleting}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
