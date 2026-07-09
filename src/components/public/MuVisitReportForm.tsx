'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Loader2, Send, ChevronDown, ChevronUp, MapPin, Calendar, Coins, StickyNote } from 'lucide-react';

interface Props {
  isPersonalBurden: boolean;
}

export default function MuVisitReportForm({ isPersonalBurden }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    visitedClubName: '',
    visitDate: '',
    feeAmount: '',
    note: '',
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.visitedClubName.trim()) {
      setError('訪問先クラブ名を入力してください');
      return;
    }
    if (!form.visitDate) {
      setError('訪問日を入力してください');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/mu-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitedClubName: form.visitedClubName.trim(),
          visitDate: form.visitDate,
          feeAmount: Number(form.feeAmount) || 0,
          note: form.note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登録に失敗しました');
        return;
      }
      setSuccess(true);
      setForm({ visitedClubName: '', visitDate: '', feeAmount: '', note: '' });
      setTimeout(() => {
        setSuccess(false);
        setOpen(false);
        router.refresh();
      }, 1500);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* トグルヘッダー */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-blue-700">
          <PlusCircle className="h-4 w-4" />
          他クラブMU訪問を報告する
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* フォーム本体 */}
      {open && (
        <div className="border-t px-4 py-4">
          {isPersonalBurden ? (
            <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mb-3">
              ℹ️ あなたのクラブはMU費個人負担設定のため、会計への自動計上は行われません。訪問回数の管理のみ行います。
            </p>
          ) : (
            <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 mb-3">
              ✅ MU費はクラブ負担として会計に自動計上されます。後日、幹事より精算されます。
            </p>
          )}

          {success && (
            <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-3">
              ✅ 報告を受け付けました！
            </p>
          )}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* 訪問先クラブ名 */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                <MapPin className="h-3.5 w-3.5" />
                訪問先クラブ名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="visitedClubName"
                value={form.visitedClubName}
                onChange={handleChange}
                placeholder="例: ○○RAC"
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* 訪問日 */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                <Calendar className="h-3.5 w-3.5" />
                訪問日 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="visitDate"
                value={form.visitDate}
                onChange={handleChange}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* MU費 */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                <Coins className="h-3.5 w-3.5" />
                MU費（支払金額）
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">¥</span>
                <input
                  type="number"
                  name="feeAmount"
                  value={form.feeAmount}
                  onChange={handleChange}
                  placeholder="0"
                  min={0}
                  step={100}
                  className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* メモ */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                <StickyNote className="h-3.5 w-3.5" />
                メモ（任意）
              </label>
              <textarea
                name="note"
                value={form.note}
                onChange={handleChange}
                placeholder="気づきや感想など"
                rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting ? '登録中…' : '報告を送信'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
