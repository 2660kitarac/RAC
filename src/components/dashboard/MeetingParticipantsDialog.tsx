'use client';

import { useState, useCallback, useRef } from 'react';
import { Users, Loader2, AlertCircle, Building2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';
import { MEMBER_TYPE_LABELS, type MemberType } from '@/types';

// ─── 型定義（/api/my/meetings/[id]/participants のレスポンス） ───
interface ParticipantMember {
  id: string;
  name: string;
  participationType: string;
  position: string | null;
}

interface ParticipantVisitor extends ParticipantMember {
  clubName: string | null;
  memberType: string;
}

interface ParticipantsResponse {
  meeting: { id: string; title: string; date: string };
  members: ParticipantMember[];
  visitors: ParticipantVisitor[];
  counts: {
    members: number;
    visitors: number;
    total: number;
    meetingOnly: number;
    withParty: number;
    partyOnly: number;
  };
  waitlistCount: number;
}

// 参加区分のバッジ表示（一覧用に短い表記）
const PARTICIPATION_BADGE: Record<string, { label: string; className: string }> = {
  meeting_only: { label: '例会のみ', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  meeting_and_party: { label: '例会＋懇親会', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  party_only: { label: '懇親会のみ', className: 'bg-pink-100 text-pink-700 border-pink-200' },
};

// ─── 1人分の行 ────────────────────────────────────────────
function ParticipantRow({
  name,
  position,
  participationType,
  clubName,
  memberType,
}: {
  name: string;
  position: string | null;
  participationType: string;
  clubName?: string | null;
  memberType?: string;
}) {
  const badge = PARTICIPATION_BADGE[participationType];
  const memberTypeLabel = memberType
    ? MEMBER_TYPE_LABELS[memberType as MemberType] ?? memberType
    : null;
  const isVisitor = clubName !== undefined;

  return (
    <li className="flex w-full items-start justify-between gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-gray-900 break-words">{name}</span>
          {position && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
              {position}
            </span>
          )}
        </div>
        {isVisitor && (clubName || memberTypeLabel) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="break-words">{clubName || 'クラブ未記入'}</span>
            {memberTypeLabel && <span className="text-gray-400">・{memberTypeLabel}</span>}
          </p>
        )}
      </div>
      {badge && (
        <span
          className={cn(
            'shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium',
            badge.className,
          )}
        >
          {badge.label}
        </span>
      )}
    </li>
  );
}

// ─── セクション（自クラブ / MU・ビジター） ─────────────────
function Section({ title, count, children, empty }: {
  title: string;
  count: number;
  children: React.ReactNode;
  empty: boolean;
}) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center justify-between text-sm font-semibold text-gray-700">
        <span>{title}</span>
        <span className="text-xs font-normal text-gray-500 tabular-nums">{count}名</span>
      </h3>
      {empty ? (
        <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">
          まだ登録はありません
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">{children}</ul>
      )}
    </section>
  );
}

// ─── 参加者一覧ボタン＋ダイアログ ──────────────────────────
export function MeetingParticipantsDialog({
  meetingId,
  meetingTitle,
  meetingDate,
}: {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ParticipantsResponse | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    setData(null); // 前回の表示を残さず、常に最新の一覧を表示する
    try {
      const res = await fetch(`/api/my/meetings/${encodeURIComponent(meetingId)}/participants`, {
        cache: 'no-store',
        signal,
      });
      if (!res.ok) {
        const msg =
          res.status === 403
            ? 'この例会の参加者一覧は表示できません。'
            : res.status === 404
              ? '例会が見つかりませんでした。'
              : '参加者一覧を読み込めませんでした。時間をおいて再度お試しください。';
        throw new Error(msg);
      }
      const json = (await res.json()) as ParticipantsResponse;
      setData(json);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message || '参加者一覧を読み込めませんでした。');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [meetingId]);

  // 開くたびに最新の一覧を取得する（閉じたら読み込み中の通信を止める）
  const controllerRef = useRef<AbortController | null>(null);
  const handleOpenChange = (next: boolean) => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setOpen(next);
    if (next) {
      const controller = new AbortController();
      controllerRef.current = controller;
      void load(controller.signal);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => handleOpenChange(true)}
        className="h-11 w-full justify-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
      >
        <Users className="h-4 w-4" />
        参加者一覧を見る
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              参加者一覧
            </DialogTitle>
            <DialogDescription className="break-words">
              {meetingTitle}・{formatDate(meetingDate)}
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              読み込み中…
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {data && !error && (
            <div className="min-w-0 space-y-4">
              {/* 集計 */}
              <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                <p className="font-semibold">
                  合計 {data.counts.total}名
                  <span className="font-normal">
                    （自クラブ {data.counts.members}名 / MU {data.counts.visitors}名）
                  </span>
                </p>
                {data.waitlistCount > 0 && (
                  <p className="mt-0.5 text-xs text-yellow-700">キャンセル待ち {data.waitlistCount}名</p>
                )}
              </div>

              <Section title="自クラブ" count={data.members.length} empty={data.members.length === 0}>
                {data.members.map(m => (
                  <ParticipantRow
                    key={m.id}
                    name={m.name}
                    position={m.position}
                    participationType={m.participationType}
                  />
                ))}
              </Section>

              <Section title="MU・ビジター" count={data.visitors.length} empty={data.visitors.length === 0}>
                {data.visitors.map(v => (
                  <ParticipantRow
                    key={v.id}
                    name={v.name}
                    position={v.position}
                    participationType={v.participationType}
                    clubName={v.clubName}
                    memberType={v.memberType}
                  />
                ))}
              </Section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
