'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  ArrowLeft, Save, Sparkles, Copy, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Meeting, MeetingReport } from '@/types';

interface MeetingReportEditorProps {
  meeting: Meeting;
  existingReport: MeetingReport | null;
  attendanceStats: {
    total: number; rac: number; rc: number; obog: number; guest: number;
    income: number; expense: number;
  };
  userId?: string;
}

export default function MeetingReportEditor({
  meeting, existingReport, attendanceStats, userId
}: MeetingReportEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [form, setForm] = useState({
    title: existingReport?.title || `${meeting.title} 例会報告書`,
    summary: existingReport?.summary || '',
    report_body: existingReport?.report_body || '',
    participants_count: existingReport?.participants_count ?? attendanceStats.total,
    rac_count: existingReport?.rac_count ?? attendanceStats.rac,
    rc_count: existingReport?.rc_count ?? attendanceStats.rc,
    obog_count: existingReport?.obog_count ?? attendanceStats.obog,
    guest_count: existingReport?.guest_count ?? attendanceStats.guest,
    income_total: existingReport?.income_total ?? attendanceStats.income,
    expense_total: existingReport?.expense_total ?? attendanceStats.expense,
    additional_notes: '',
  });

  const generateAiReport = async () => {
    setAiLoading(true);
    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting: {
            title: meeting.title,
            date: meeting.date,
            venue_name: meeting.venue_name,
            theme: meeting.theme,
            committee: meeting.committee,
            description: meeting.description,
          },
          stats: {
            participants_count: form.participants_count,
            rac_count: form.rac_count,
            rc_count: form.rc_count,
            obog_count: form.obog_count,
            guest_count: form.guest_count,
            income_total: form.income_total,
            expense_total: form.expense_total,
          },
          notes: form.additional_notes,
        }),
      });

      const data = await response.json();
      if (data.report) {
        setForm(prev => ({ ...prev, report_body: data.report }));
        toast.success('AIで報告書を生成しました');
      } else {
        throw new Error(data.error || 'AI生成に失敗しました');
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'AI生成に失敗しました');
    } finally {
      setAiLoading(false);
    }
  };

  const saveReport = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId: meeting.club_id,
          meetingId: meeting.id,
          title: form.title,
          summary: form.summary || null,
          reportBody: form.report_body || null,
          participantsCount: form.participants_count,
          racCount: form.rac_count,
          rcCount: form.rc_count,
          obogCount: form.obog_count,
          guestCount: form.guest_count,
          incomeTotal: form.income_total,
          expenseTotal: form.expense_total,
          balance: form.income_total - form.expense_total,
          createdBy: userId || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存に失敗しました');

      toast.success('報告書を保存しました');
      router.push(`/meetings/${meeting.id}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(form.report_body);
    toast.success('クリップボードにコピーしました');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href={`/meetings/${meeting.id}`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" />戻る</Button>
        </Link>
        <h1 className="page-title">例会報告書作成</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" />
            例会情報
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-1">例会名</p>
              <p className="font-medium">{meeting.title}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">開催日</p>
              <p className="font-medium">{formatDate(meeting.date)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">会場</p>
              <p className="font-medium">{meeting.venue_name || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 参加者・収支 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">参加者・収支情報</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {[
              { key: 'participants_count', label: '参加者合計' },
              { key: 'rac_count', label: 'RAC参加' },
              { key: 'rc_count', label: 'RC参加' },
              { key: 'obog_count', label: 'OB・OG参加' },
              { key: 'guest_count', label: 'ゲスト参加' },
            ].map(({ key, label }) => (
              <div key={key} className="form-group">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  min="0"
                  value={(form as Record<string, unknown>)[key] as number}
                  onChange={e => setForm(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { key: 'income_total', label: '収入合計（円）' },
              { key: 'expense_total', label: '支出合計（円）' },
            ].map(({ key, label }) => (
              <div key={key} className="form-group">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  min="0"
                  value={(form as Record<string, unknown>)[key] as number}
                  onChange={e => setForm(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
            ))}
            <div className="form-group">
              <Label className="text-xs">差引収支</Label>
              <div className={`mt-1 h-10 flex items-center px-3 rounded-md border ${form.income_total >= form.expense_total ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'} font-bold`}>
                {formatCurrency(form.income_total - form.expense_total)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI生成 */}
      <Card className="border-purple-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-purple-700">
            <Sparkles className="h-4 w-4" />
            AI報告書生成
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="form-group">
            <Label>当日の様子・学び・感想（AIへの追加情報）</Label>
            <Textarea
              value={form.additional_notes}
              onChange={e => setForm(prev => ({ ...prev, additional_notes: e.target.value }))}
              placeholder="例：参加者から活発な意見が出て有意義な討議ができました。次回への改善点として...など"
              rows={3}
              className="mt-1"
            />
          </div>
          <Button
            onClick={generateAiReport}
            loading={aiLoading}
            variant="outline"
            className="border-purple-300 text-purple-700 hover:bg-purple-50"
          >
            <Sparkles className="h-4 w-4" />
            AIで報告書を自動生成
          </Button>
        </CardContent>
      </Card>

      {/* 報告書本文 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">報告書本文</CardTitle>
            {form.report_body && (
              <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                <Copy className="h-4 w-4" />コピー
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="form-group">
            <Label>タイトル</Label>
            <Input
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div className="form-group">
            <Label>概要・サマリー</Label>
            <Textarea
              value={form.summary}
              onChange={e => setForm(prev => ({ ...prev, summary: e.target.value }))}
              placeholder="報告書の概要を入力"
              rows={2}
              className="mt-1"
            />
          </div>
          <div className="form-group">
            <Label>報告書本文</Label>
            <Textarea
              value={form.report_body}
              onChange={e => setForm(prev => ({ ...prev, report_body: e.target.value }))}
              placeholder="報告書本文を入力、またはAIで生成してください"
              rows={15}
              className="mt-1 font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href={`/meetings/${meeting.id}`}>
          <Button variant="outline">キャンセル</Button>
        </Link>
        <Button onClick={saveReport} loading={loading}>
          <Save className="h-4 w-4" />
          報告書を保存
        </Button>
      </div>
    </div>
  );
}
