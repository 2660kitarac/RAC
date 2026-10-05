'use client';

/**
 * 地区への提出 — Instagram タブ（クラブ側）
 *  - 自クラブの投稿一覧（状態・スコア・差し戻し理由）
 *  - 投稿URLの提出・修正（保存すると審査待ちになる）
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Camera, ExternalLink, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  LIMITS, POST_STATUS_LABELS, POST_TYPES, POST_TYPE_LABELS, checkPostUrl, fmtDate, meetingLabel, safeLink,
} from '@/lib/district/submissions';
import { MeetingSelect, StatusPill, callApi, selectClass, type ClubPostItem, type MeetingOption } from './shared';

export function PostsPanel({
  posts, meetings, canSubmit,
}: {
  posts: ClubPostItem[];
  meetings: MeetingOption[];
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ClubPostItem | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const approved = posts.filter((p) => p.status === 'approved');
  const totalScore = approved.reduce((s, p) => s + (p.score ?? 0), 0);

  const remove = async (p: ClubPostItem) => {
    if (!window.confirm('この投稿の提出を取り消します。よろしいですか？')) return;
    setBusyId(p.id);
    const ok = await callApi(`/api/club/district-submissions/${encodeURIComponent(p.id)}?kind=instagram`, { method: 'DELETE' }, '削除しました');
    setBusyId(null);
    if (ok) router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          クラブのInstagramに投稿したら、その投稿のURLを提出してください。地区が承認するとスコア（表彰ポイント）が付きます。
        </p>
        <Button onClick={() => setEditing('new')} disabled={!canSubmit} className="shrink-0">
          <Plus />投稿URLを提出
        </Button>
      </div>

      {approved.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-white px-4 py-3 text-sm">
          <span>承認された投稿 <b className="text-gray-900">{approved.length}件</b></span>
          <span>合計スコア <b className="text-indigo-700">{totalScore}点</b></span>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
          <Camera className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          まだ提出した投稿はありません。「投稿URLを提出」から、Instagram投稿のURLを送りましょう。
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {posts.map((p) => {
            const link = safeLink(p.postUrl);
            const meeting = meetingLabel({ date: p.meetingDate, title: p.meetingTitle, meetingNumber: p.meetingNumber });
            const editable = p.status === 'pending' || p.status === 'rejected';
            return (
              <Card key={p.id} className={p.status === 'rejected' ? 'border-red-300' : undefined}>
                <CardContent className="flex h-full flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={p.status} labels={POST_STATUS_LABELS} />
                      <span className="text-xs text-gray-500">{POST_TYPE_LABELS[p.postType] ?? p.postType}</span>
                    </div>
                    {p.status === 'approved' && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">{p.score}点</span>
                    )}
                  </div>

                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-sm text-indigo-700 hover:underline">
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      <span className="truncate">{p.postUrl}</span>
                    </a>
                  ) : (
                    <p className="break-all text-sm text-gray-500">{p.postUrl || 'URL未入力'}</p>
                  )}

                  {p.caption?.trim() && (
                    <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-gray-700">{p.caption}</p>
                  )}

                  <p className="text-xs text-gray-500">
                    {meeting ? `例会：${meeting}・` : ''}提出 {fmtDate(p.submittedAt ?? p.createdAt)}
                  </p>

                  {p.status === 'rejected' && p.rejectionReason && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm">
                      <p className="flex items-center gap-1 text-xs font-semibold text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" />差し戻し理由
                      </p>
                      <p className="whitespace-pre-wrap break-words text-red-800">{p.rejectionReason}</p>
                    </div>
                  )}

                  {editable && (
                    <div className="mt-auto flex flex-wrap justify-end gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => remove(p)} loading={busyId === p.id}>
                        <Trash2 />削除
                      </Button>
                      <Button size="sm" onClick={() => setEditing(p)} disabled={!canSubmit}>
                        <Pencil />{p.status === 'rejected' ? '直して再提出' : '修正'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <PostFormDialog
          key={editing === 'new' ? 'new' : editing.id}
          post={editing === 'new' ? null : editing}
          meetings={meetings}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

/** 投稿URLの提出・修正ダイアログ */
function PostFormDialog({
  post, meetings, onClose, onSaved,
}: {
  post: ClubPostItem | null;
  meetings: MeetingOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [postType, setPostType] = useState(post?.postType ?? 'after');
  const [postUrl, setPostUrl] = useState(post?.postUrl ?? '');
  const [meetingId, setMeetingId] = useState(post?.meetingId ?? '');
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [busy, setBusy] = useState(false);

  const urlCheck = postUrl.trim() ? checkPostUrl(postUrl) : {};
  const options: MeetingOption[] =
    post?.meetingId && !meetings.some((m) => m.id === post.meetingId)
      ? [{ id: post.meetingId, title: post.meetingTitle ?? '', date: post.meetingDate ?? '', meetingNumber: post.meetingNumber, hasReport: false }, ...meetings]
      : meetings;

  const save = async () => {
    const c = checkPostUrl(postUrl);
    if (c.error) { toast.error(c.error); return; }
    if (c.warning && !window.confirm(`${c.warning}\nこのまま提出しますか？`)) return;
    setBusy(true);
    const body = { kind: 'instagram', postType, postUrl, meetingId: meetingId || null, caption };
    const res = post
      ? await callApi(`/api/club/district-submissions/${encodeURIComponent(post.id)}`, { method: 'PUT', body }, '提出しました')
      : await callApi('/api/club/district-submissions', { method: 'POST', body }, '提出しました');
    setBusy(false);
    if (res) onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{post ? (post.status === 'rejected' ? '投稿を直して再提出' : '投稿の提出内容を修正') : 'Instagram投稿URLを提出'}</DialogTitle>
          <DialogDescription>
            Instagramアプリで投稿の「…」→「リンクをコピー」を押すと、URLをコピーできます。
          </DialogDescription>
        </DialogHeader>

        {post?.status === 'rejected' && post.rejectionReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-semibold text-red-700">差し戻し理由</p>
            <p className="whitespace-pre-wrap break-words text-red-800">{post.rejectionReason}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pf-type">投稿の種類</Label>
            <select id="pf-type" value={postType} onChange={(e) => setPostType(e.target.value)} className={selectClass}>
              {POST_TYPES.map((t) => (
                <option key={t} value={t}>{POST_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-url">投稿URL</Label>
            <Input
              id="pf-url"
              type="url"
              inputMode="url"
              value={postUrl}
              maxLength={LIMITS.postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://www.instagram.com/p/xxxxxxxx/"
            />
            {urlCheck.error && <p className="text-xs text-red-600">{urlCheck.error}</p>}
            {urlCheck.warning && <p className="text-xs text-amber-700">{urlCheck.warning}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-meeting">関連する例会（任意）</Label>
            <MeetingSelect id="pf-meeting" value={meetingId} onChange={setMeetingId} meetings={options} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-caption">キャプション・メモ（任意）</Label>
            <Textarea
              id="pf-caption"
              rows={4}
              maxLength={LIMITS.caption}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="投稿の文章や、地区の担当者に伝えたいことがあれば書いてください"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>キャンセル</Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={save} loading={busy} disabled={!!urlCheck.error || !postUrl.trim()}>
            <Send />地区へ提出
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
