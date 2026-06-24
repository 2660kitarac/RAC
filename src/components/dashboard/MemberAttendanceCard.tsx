'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Calendar, MapPin, Clock, Users, PartyPopper, ChevronDown, ChevronUp, CheckCircle, XCircle, Hourglass, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatCurrency } from '@/lib/utils';

type ParticipationType = 'meeting_only' | 'meeting_and_party' | 'absent' | 'waitlist' | null;

interface MeetingWithAttendance {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  venueAddress: string | null;
  status: string;
  registrationDeadline: string | null;
  feeRac: number;
  feeRc: number;
  feeObog: number;
  feeGuest: number;
  hasAfterParty: boolean;
  afterPartyVenue: string | null;
  afterPartyStartTime: string | null;
  afterPartyFeeRac: number;
  afterPartyFeeRc: number;
  afterPartyFeeObog: number;
  afterPartyFeeGuest: number;
  capacity: number | null;
  afterPartyCapacity: number | null;
  currentCount: number;
  myAttendance: {
    id: string;
    participation_type?: string;
    participationType?: string;
    note: string | null;
    attendance_status?: string;
    attendanceStatus?: string;
  } | null;
}

interface MemberAttendanceCardProps {
  memberType: string; // 'RAC' | 'RC' | 'OB_OG' | 'GUEST'
}

const PARTICIPATION_LABELS: Record<string, string> = {
  meeting_only: '例会のみ参加',
  meeting_and_party: '例会＋懇親会参加',
  absent: '欠席',
  waitlist: 'キャンセル待ち',
};

const PARTICIPATION_COLORS: Record<string, string> = {
  meeting_only: 'bg-blue-100 text-blue-800',
  meeting_and_party: 'bg-purple-100 text-purple-800',
  absent: 'bg-red-100 text-red-800',
  waitlist: 'bg-yellow-100 text-yellow-800',
};

export default function MemberAttendanceCard({ memberType }: MemberAttendanceCardProps) {
  const [meetings, setMeetings] = useState<MeetingWithAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/my/attendance')
      .then(r => r.json())
      .then(data => {
        setMeetings(data.meetings || []);
        // 既存メモをセット
        const notes: Record<string, string> = {};
        for (const m of (data.meetings || [])) {
          if (m.myAttendance?.note) notes[m.id] = m.myAttendance.note;
        }
        setNoteInputs(notes);
      })
      .catch(() => toast.error('例会情報の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, []);

  const getFee = (m: MeetingWithAttendance, type: 'meeting' | 'party') => {
    if (type === 'meeting') {
      if (memberType === 'RAC') return m.feeRac;
      if (memberType === 'RC') return m.feeRc;
      if (memberType === 'OB_OG') return m.feeObog;
      return m.feeGuest;
    } else {
      if (memberType === 'RAC') return m.afterPartyFeeRac;
      if (memberType === 'RC') return m.afterPartyFeeRc;
      if (memberType === 'OB_OG') return m.afterPartyFeeObog;
      return m.afterPartyFeeGuest;
    }
  };

  const isDeadlinePassed = (deadline: string | null) => {
    if (!deadline) return false;
    return new Date().toISOString().split('T')[0] > deadline;
  };

  const handleRegister = async (meetingId: string, participationType: ParticipationType, isWaitlist = false) => {
    if (isDeadlinePassed(meetings.find(m => m.id === meetingId)?.registrationDeadline || null)) {
      toast.error('登録締切日を過ぎています');
      return;
    }

    const finalType = isWaitlist ? 'waitlist' : participationType;
    setSubmitting(meetingId);
    try {
      const res = await fetch('/api/my/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          participationType: finalType,
          note: noteInputs[meetingId] || null,
        }),
      });
      const data = await res.json();

      if (res.status === 409 && data.canWaitlist) {
        // 定員超過 → キャンセル待ち確認
        if (confirm('定員に達しています。キャンセル待ちとして登録しますか？')) {
          await handleRegister(meetingId, participationType, true);
        }
        return;
      }

      if (!res.ok) throw new Error(data.error);

      // UI更新
      setMeetings(prev => prev.map(m => {
        if (m.id !== meetingId) return m;
        return {
          ...m,
          myAttendance: {
            id: data.id,
            participation_type: finalType,
            note: noteInputs[meetingId] || null,
          },
          currentCount: finalType !== 'absent' && finalType !== 'waitlist'
            ? (m.myAttendance ? m.currentCount : m.currentCount + 1)
            : m.currentCount,
        };
      }));

      toast.success(
        finalType === 'absent' ? '欠席を登録しました' :
        finalType === 'waitlist' ? 'キャンセル待ちで登録しました' :
        `「${PARTICIPATION_LABELS[finalType!]}」で登録しました`
      );
    } catch (err: any) {
      toast.error(err.message || '登録に失敗しました');
    } finally {
      setSubmitting(null);
    }
  };

  const displayedMeetings = expanded ? meetings : meetings.slice(0, 1);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-20 bg-gray-200 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (meetings.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            例会出席登録
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">現在募集中の例会はありません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-500" />
          例会出席登録
          <Badge variant="secondary" className="ml-auto text-xs">{meetings.length}件</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {displayedMeetings.map(meeting => {
          const myType = meeting.myAttendance?.participation_type || meeting.myAttendance?.participationType || null;
          const deadlinePassed = isDeadlinePassed(meeting.registrationDeadline);
          const isFull = meeting.capacity !== null && meeting.currentCount >= meeting.capacity;
          const isSubmitting = submitting === meeting.id;
          const meetingFee = getFee(meeting, 'meeting');
          const partyFee = getFee(meeting, 'party');

          return (
            <div key={meeting.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
              {/* 例会ヘッダー */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{meeting.title}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(meeting.date)}
                      {meeting.startTime && ` ${meeting.startTime.substring(0, 5)}`}
                    </span>
                    {meeting.venueName && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {meeting.venueName}
                      </span>
                    )}
                    {meeting.capacity && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {meeting.currentCount}/{meeting.capacity}名
                      </span>
                    )}
                  </div>
                </div>
                {/* 現在の登録状況バッジ */}
                {myType && (
                  <Badge className={`text-xs shrink-0 ${PARTICIPATION_COLORS[myType]}`}>
                    {myType === 'meeting_only' && <CheckCircle className="h-3 w-3 mr-1" />}
                    {myType === 'meeting_and_party' && <PartyPopper className="h-3 w-3 mr-1" />}
                    {myType === 'absent' && <XCircle className="h-3 w-3 mr-1" />}
                    {myType === 'waitlist' && <Hourglass className="h-3 w-3 mr-1" />}
                    {PARTICIPATION_LABELS[myType]}
                  </Badge>
                )}
              </div>

              {/* 締切警告 */}
              {deadlinePassed && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                  <AlertCircle className="h-3 w-3" />
                  登録締切（{meeting.registrationDeadline}）を過ぎています
                </div>
              )}

              {/* 満員警告 */}
              {isFull && !myType && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">
                  <AlertCircle className="h-3 w-3" />
                  定員に達しています（キャンセル待ちでの登録は可能）
                </div>
              )}

              {/* 登録ボタン群 */}
              {!deadlinePassed && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {/* 例会のみ参加 */}
                    <button
                      onClick={() => handleRegister(meeting.id, 'meeting_only')}
                      disabled={isSubmitting}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                        myType === 'meeting_only'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                      } disabled:opacity-50`}
                    >
                      <CheckCircle className="h-4 w-4" />
                      例会のみ
                      {meetingFee > 0 && <span className="text-xs opacity-70">{formatCurrency(meetingFee)}</span>}
                    </button>

                    {/* 例会＋懇親会参加（懇親会ありの場合のみ） */}
                    {meeting.hasAfterParty && (
                      <button
                        onClick={() => handleRegister(meeting.id, 'meeting_and_party')}
                        disabled={isSubmitting}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                          myType === 'meeting_and_party'
                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-purple-300 hover:bg-purple-50'
                        } disabled:opacity-50`}
                      >
                        <PartyPopper className="h-4 w-4" />
                        例会＋懇親会
                        {(meetingFee + partyFee) > 0 && (
                          <span className="text-xs opacity-70">{formatCurrency(meetingFee + partyFee)}</span>
                        )}
                      </button>
                    )}

                    {/* 欠席 */}
                    <button
                      onClick={() => handleRegister(meeting.id, 'absent')}
                      disabled={isSubmitting}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                        myType === 'absent'
                          ? 'border-red-400 bg-red-50 text-red-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:bg-red-50'
                      } disabled:opacity-50`}
                    >
                      <XCircle className="h-4 w-4" />
                      欠席
                    </button>
                  </div>

                  {/* 懇親会情報（懇親会ありの場合） */}
                  {meeting.hasAfterParty && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 pl-1">
                      <PartyPopper className="h-3 w-3 text-purple-400" />
                      懇親会：{meeting.afterPartyVenue || '場所未定'}
                      {meeting.afterPartyStartTime && ` ${meeting.afterPartyStartTime.substring(0, 5)}〜`}
                    </div>
                  )}

                  {/* メモ入力 */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setNoteOpen(prev => ({ ...prev, [meeting.id]: !prev[meeting.id] }))}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                      メモを追加（遅刻・早退など）
                      {noteOpen[meeting.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {(noteOpen[meeting.id] || noteInputs[meeting.id]) && (
                      <Textarea
                        value={noteInputs[meeting.id] || ''}
                        onChange={e => setNoteInputs(prev => ({ ...prev, [meeting.id]: e.target.value }))}
                        placeholder="例：19時頃に遅れて参加します"
                        rows={2}
                        className="mt-1 text-sm"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* 登録済みメモ表示 */}
              {myType && meeting.myAttendance?.note && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                  💬 {meeting.myAttendance.note}
                </div>
              )}
            </div>
          );
        })}

        {/* もっと見る / 折りたたむ */}
        {meetings.length > 1 && (
          <button
            onClick={() => setExpanded(prev => !prev)}
            className="w-full text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 py-1"
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" />折りたたむ</>
            ) : (
              <><ChevronDown className="h-3 w-3" />他 {meetings.length - 1} 件の例会を表示</>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
