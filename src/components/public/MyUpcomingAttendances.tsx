'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Trash2 } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

interface UpcomingAttendance {
  id: string;
  meetingId: string;
  meetingTitle: string | null;
  meetingDate: string | null;
  feeAmount: number;
  paymentStatus: string;
  attendanceType?: string | null;
  clubName?: string | null;
  clubShortName?: string | null;
}

interface Props {
  attendances: UpcomingAttendance[];
  slug: string;
}

export default function MyUpcomingAttendances({ attendances, slug }: Props) {
  const router = useRouter();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [localList, setLocalList] = useState(attendances);

  const handleCancel = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setCancelingId(id);
    setConfirmId(null);
    try {
      const res = await fetch(`/api/attendances/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('キャンセルに失敗しました');
      setLocalList(prev => prev.filter(a => a.id !== id));
      toast.success('参加登録をキャンセルしました');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCancelingId(null);
    }
  };

  if (localList.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">今後の参加予定はありません</p>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-xl border divide-y overflow-hidden"
      onClick={e => {
        const t = e.target as HTMLElement;
        if (!t.closest('[data-cancel-btn]')) setConfirmId(null);
      }}
    >
      {localList.map((a) => {
        const isPaid = a.paymentStatus === 'paid';
        const isConfirming = confirmId === a.id;
        const isCanceling = cancelingId === a.id;

        return (
          <div key={a.id} className="p-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-purple-600 font-medium">
                {a.clubShortName || a.clubName}
              </p>
              <p className="text-sm font-medium text-gray-900 truncate">{a.meetingTitle || '—'}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {a.meetingDate ? formatDate(a.meetingDate) : '—'}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-mono text-gray-800">{formatCurrency(a.feeAmount)}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {isPaid ? '支払済' : '未払い'}
              </span>
            </div>
            {!isPaid && (
              <button
                data-cancel-btn="true"
                disabled={isCanceling}
                onClick={() => handleCancel(a.id)}
                className={`flex-shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  isConfirming
                    ? 'bg-red-500 text-white border-red-500'
                    : 'text-red-400 border-red-200 hover:bg-red-50'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isCanceling ? '…' : isConfirming ? '確認' : 'キャンセル'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
