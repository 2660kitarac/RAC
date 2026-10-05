'use client';

/**
 * Instagram 投稿の審査画面（地区役員用）
 *  - 状態タブ＋クラブ絞り込み、投稿ごとのカード（承認＋スコア／差し戻し／やり直し／スコア変更）
 *  - クラブ別ランキング（今年度の承認数・合計スコア）
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CheckCircle2, ExternalLink, RotateCcw, Trophy, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  LIMITS, POST_STATUS_LABELS, POST_TYPE_LABELS, SCORE_DEFAULT, SCORE_MAX, SCORE_MIN,
  fmtDate, fmtDateTime, meetingLabel, parseScore, safeLink,
} from '@/lib/district/submissions';
import { CountTabs, StatusPill, sendPatch } from './shared';
import type { ReviewClub } from './ReportReview';

export type ReviewPost = {
  id: string;
  clubId: string;
  clubName: string;
  postType: string;
  postUrl: string | null;
  caption: string | null;
  imageUrl: string | null;
  status: string;
  score: number;
  rejectionReason: string | null;
  meetingTitle: string | null;
  meetingDate: string | null;
  meetingNumber: number | null;
  submittedAt: string | null;
  createdAt: string;
  reviewedAt: string | null;
  submitterName: string | null;
  reviewerName: string | null;
};

type TabKey = 'pending' | 'rejected' | 'approved' | 'all';

export function InstagramReview({
  posts, clubs, year,
}: {
  posts: ReviewPost[];
  clubs: ReviewClub[];
  year: { start: string; end: string; label: string };
}) {
  const [tab, setTab] = useState<TabKey>('pending');
  const [clubId, setClubId] = useState('');

  const byClub = useMemo(() => (clubId ? posts.filter((p) => p.clubId === clubId) : posts), [posts, clubId]);
  const count = (s: string) => byClub.filter((p) => p.status === s).length;
  const shown = tab === 'all' ? byClub : byClub.filter((p) => p.status === tab);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        承認するときに <b>{SCORE_MIN}〜{SCORE_MAX}点</b> のスコアを付けます。スコアは年度末の
        <b>表彰ポイント</b>の計算に使われます（目安：ふつう {SCORE_DEFAULT}点、特に良い投稿は高めに）。
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CountTabs<TabKey>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'pending', label: '審査待ち', count: count('pending'), highlight: true },
              { key: 'rejected', label: '差し戻し', count: count('rejected') },
              { key: 'approved', label: '承認済み', count: count('approved') },
              { key: 'all', label: 'すべて', count: byClub.length },
            ]}
          />
          <div className="flex items-center gap-2">
            <Label htmlFor="insta-club-filter" className="whitespace-nowrap text-sm text-gray-600">クラブ</Label>
            <select
              id="insta-club-filter"
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm md:w-56"
            >
              <option value="">すべてのクラブ</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
            <Camera className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            {tab === 'pending'
              ? '審査待ちの投稿はありません。クラブが投稿URLを提出するとここに表示されます。'
              : '該当する投稿はありません。'}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {shown.map((p) => <PostCard key={p.id} post={p} />)}
          </div>
        )}
      </div>

      <Ranking posts={posts} clubs={clubs} year={year} />
    </div>
  );
}

/** 投稿1件のカード */
function PostCard({ post }: { post: ReviewPost }) {
  const router = useRouter();
  const [score, setScore] = useState(String(post.status === 'approved' ? post.score : SCORE_DEFAULT));
  const [mode, setMode] = useState<'none' | 'reject' | 'score'>('none');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const link = safeLink(post.postUrl);
  const image = safeLink(post.imageUrl);
  const meeting = meetingLabel({ date: post.meetingDate, title: post.meetingTitle, meetingNumber: post.meetingNumber });
  const scoreOk = parseScore(score) !== null;

  const act = async (action: 'approve' | 'reject' | 'reopen' | 'score') => {
    if (action === 'reopen' && !window.confirm('この投稿を「審査待ち」に戻します。スコアは0点に戻ります。よろしいですか？')) return;
    setBusy(true);
    const ok = await sendPatch(
      `/api/district/instagram/${encodeURIComponent(post.id)}`,
      {
        action,
        score: action === 'approve' || action === 'score' ? Number(score) : undefined,
        reason: action === 'reject' ? reason : undefined,
      },
      { approve: '承認しました', reject: '差し戻しました', reopen: '審査待ちに戻しました', score: 'スコアを変更しました' }[action],
    );
    setBusy(false);
    if (ok) {
      setMode('none');
      setReason('');
      if (action === 'reopen') setScore(String(SCORE_DEFAULT));
      router.refresh();
    }
  };

  const scoreInput = (
    <div className="flex items-center gap-2">
      <Label htmlFor={`score-${post.id}`} className="whitespace-nowrap text-sm">スコア</Label>
      <Input
        id={`score-${post.id}`}
        type="number"
        inputMode="numeric"
        min={SCORE_MIN}
        max={SCORE_MAX}
        step={1}
        value={score}
        onChange={(e) => setScore(e.target.value)}
        className="h-9 w-20"
      />
      <span className="text-xs text-gray-500">/ {SCORE_MAX}点</span>
    </div>
  );

  return (
    <Card className="flex min-w-0 flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{post.clubName}</p>
            <p className="text-xs text-gray-500">
              {POST_TYPE_LABELS[post.postType] ?? post.postType}・提出 {fmtDate(post.submittedAt ?? post.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {post.status === 'approved' && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">{post.score}点</span>
            )}
            <StatusPill status={post.status} labels={POST_STATUS_LABELS} />
          </div>
        </div>

        {image && (
          // 外部の画像URLのため next/image は使わない
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="投稿の画像" loading="lazy" className="max-h-64 w-full rounded-lg border object-cover" />
        )}

        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
          >
            <ExternalLink className="h-4 w-4" />投稿を開く
          </a>
        ) : (
          <p className="break-all text-xs text-gray-500">
            URL：{post.postUrl || '未入力'}{post.postUrl && '（リンクとして開けない形式です）'}
          </p>
        )}

        {post.caption?.trim() && (
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-2 text-sm text-gray-700">
            {post.caption}
          </p>
        )}

        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs text-gray-600">
          <dt className="text-gray-500">関連する例会</dt>
          <dd className="min-w-0 break-words">{meeting || 'なし'}</dd>
          {post.submitterName && (
            <>
              <dt className="text-gray-500">提出者</dt>
              <dd>{post.submitterName}</dd>
            </>
          )}
          {post.reviewedAt && (
            <>
              <dt className="text-gray-500">審査</dt>
              <dd>{fmtDateTime(post.reviewedAt)}{post.reviewerName ? `（${post.reviewerName}）` : ''}</dd>
            </>
          )}
        </dl>

        {post.status === 'rejected' && post.rejectionReason && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm">
            <p className="text-xs font-semibold text-red-700">差し戻し理由</p>
            <p className="whitespace-pre-wrap break-words text-red-800">{post.rejectionReason}</p>
          </div>
        )}

        <div className="mt-auto space-y-2 border-t pt-3">
          {post.status === 'pending' && mode !== 'reject' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {scoreInput}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setMode('reject')} disabled={busy}>
                  <Undo2 />差し戻し
                </Button>
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => act('approve')}
                  loading={busy}
                  disabled={!scoreOk}
                >
                  <CheckCircle2 />承認
                </Button>
              </div>
            </div>
          )}

          {post.status === 'pending' && mode === 'reject' && (
            <div className="space-y-2">
              <Label htmlFor={`reason-${post.id}`}>差し戻しの理由（クラブに表示されます）</Label>
              <Textarea
                id={`reason-${post.id}`}
                rows={3}
                maxLength={LIMITS.reason}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例：URLが開けません。投稿のURLをもう一度確認してください。"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setMode('none'); setReason(''); }} disabled={busy}>やめる</Button>
                <Button size="sm" variant="destructive" onClick={() => act('reject')} loading={busy} disabled={!reason.trim()}>
                  差し戻す
                </Button>
              </div>
            </div>
          )}

          {post.status === 'approved' && mode === 'score' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {scoreInput}
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setMode('none'); setScore(String(post.score)); }} disabled={busy}>
                  やめる
                </Button>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => act('score')} loading={busy} disabled={!scoreOk}>
                  保存
                </Button>
              </div>
            </div>
          )}

          {(post.status === 'approved' || post.status === 'rejected') && mode !== 'score' && (
            <div className="flex flex-wrap justify-end gap-2">
              {post.status === 'approved' && (
                <Button size="sm" variant="outline" onClick={() => { setScore(String(post.score)); setMode('score'); }} disabled={busy}>
                  スコアを変更
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => act('reopen')} loading={busy}>
                <RotateCcw />審査をやり直す
              </Button>
            </div>
          )}

          {post.status === 'pending' && !scoreOk && mode !== 'reject' && (
            <p className="text-xs text-red-600">スコアは{SCORE_MIN}〜{SCORE_MAX}の整数で入力してください</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** クラブ別ランキング（今年度に提出された投稿のうち承認済み） */
function Ranking({
  posts, clubs, year,
}: {
  posts: ReviewPost[];
  clubs: ReviewClub[];
  year: { start: string; end: string; label: string };
}) {
  const rows = clubs
    .map((c) => {
      const mine = posts.filter((p) => {
        const d = (p.submittedAt ?? p.createdAt).slice(0, 10);
        return p.clubId === c.id && p.status === 'approved' && d >= year.start && d <= year.end;
      });
      return { ...c, approved: mine.length, total: mine.reduce((s, p) => s + (p.score ?? 0), 0) };
    })
    .sort((a, b) => b.total - a.total || b.approved - a.approved || a.name.localeCompare(b.name, 'ja'));

  // 同点は同じ順位にする
  const ranked = rows.map((r) => ({
    ...r,
    rank: 1 + rows.filter((o) => o.total > r.total || (o.total === r.total && o.approved > r.approved)).length,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-amber-500" />クラブ別ランキング（今年度）
        </CardTitle>
        <p className="text-xs text-gray-500">
          {year.label}（{fmtDate(year.start)}〜{fmtDate(year.end)}）に提出され、承認された投稿の合計です。
        </p>
      </CardHeader>
      <CardContent>
        {ranked.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">地区にクラブが登録されていません。</p>
        ) : (
          <table className="rac-table w-full text-sm">
            <thead className="border-b text-left text-gray-600">
              <tr>
                <th className="w-14 py-2 pr-3 font-medium">順位</th>
                <th className="py-2 pr-3 font-medium">クラブ</th>
                <th className="px-3 py-2 text-right font-medium">承認数</th>
                <th className="px-3 py-2 text-right font-medium">合計スコア</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-bold text-gray-700" data-label="順位">
                    {r.total === 0 && r.approved === 0 ? '—' : `${r.rank}位`}
                  </td>
                  <td className="py-2 pr-3 font-medium text-gray-900" data-cell="primary">{r.name}</td>
                  <td className="px-3 py-2 text-right" data-label="承認数">{r.approved}件</td>
                  <td className="px-3 py-2 text-right font-semibold text-indigo-700" data-label="合計スコア">{r.total}点</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
