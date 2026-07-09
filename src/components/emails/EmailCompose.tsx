'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, Users, Send, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, replaceTemplateVariables } from '@/lib/utils';
import type { EmailTemplate } from '@/types';

interface EmailComposeProps {
  templates: EmailTemplate[];
  meetings: Record<string, unknown>[];
  members: { id: string; name: string; email: string; member_type: string }[];
  selectedMeeting: Record<string, unknown> | null;
  clubId: string;
  userId: string;
}

export default function EmailCompose({
  templates, meetings, members, selectedMeeting: initMeeting, clubId, userId
}: EmailComposeProps) {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedMeetingId, setSelectedMeetingId] = useState(initMeeting ? String(initMeeting.id) : '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState('all');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [meetingAttendees, setMeetingAttendees] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [loading, setSending] = useState(false);

  // CC/BCC フィールド
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');

  const selectedMeeting = selectedMeetingId
    ? meetings.find(m => m.id === selectedMeetingId) || initMeeting
    : initMeeting;

  // テンプレート適用
  useEffect(() => {
    if (selectedTemplateId && selectedMeeting) {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (template) {
        const vars: Record<string, string | number | null> = {
          meeting_title: String(selectedMeeting.title || ''),
          theme: String(selectedMeeting.theme || ''),
          date: selectedMeeting.date ? formatDate(String(selectedMeeting.date)) : '',
          start_time: String(selectedMeeting.start_time || '').substring(0, 5),
          end_time: String(selectedMeeting.end_time || '').substring(0, 5),
          venue_name: String(selectedMeeting.venue_name || ''),
          venue_address: String(selectedMeeting.venue_address || ''),
          description: String(selectedMeeting.description || ''),
          fee_rac: String(selectedMeeting.fee_rac || 0),
          fee_rc: String(selectedMeeting.fee_rc || 0),
          fee_obog: String(selectedMeeting.fee_obog || 0),
          fee_guest: String(selectedMeeting.fee_guest || 0),
          registration_deadline: selectedMeeting.registration_deadline
            ? formatDate(String(selectedMeeting.registration_deadline))
            : '',
          mu_registration_url: String(selectedMeeting.mu_registration_url || ''),
        };
        setSubject(replaceTemplateVariables(template.subject_template, vars));
        setBody(replaceTemplateVariables(template.body_template, vars));
      }
    }
  }, [selectedTemplateId, selectedMeetingId]);

  // 例会参加者を自動取得（targetType === 'meeting_attendees' かつ例会が選択済み）
  useEffect(() => {
    if (targetType === 'meeting_attendees' && selectedMeetingId) {
      setLoadingAttendees(true);
      fetch(`/api/meetings/${selectedMeetingId}/attendees-emails`)
        .then(r => r.json())
        .then(data => setMeetingAttendees(data.attendees || []))
        .catch(() => setMeetingAttendees([]))
        .finally(() => setLoadingAttendees(false));
    }
  }, [targetType, selectedMeetingId]);

  const getRecipients = () => {
    switch (targetType) {
      case 'all': return members;
      case 'rac': return members.filter(m => m.member_type === 'RAC');
      case 'rc': return members.filter(m => m.member_type === 'RC');
      case 'obog': return members.filter(m => m.member_type === 'OB_OG');
      case 'custom': return members.filter(m => selectedMembers.includes(m.id));
      case 'meeting_attendees': return meetingAttendees;
      default: return members;
    }
  };

  const recipients = getRecipients();

  // CC/BCCのメールアドレスをパース（カンマ・スペース区切り）
  const parseCcBcc = (input: string): string[] =>
    input.split(/[,\s]+/).map(s => s.trim()).filter(s => s.includes('@'));

  const handleSend = async () => {
    if (!subject || !body) {
      toast.error('件名と本文は必須です');
      return;
    }
    if (recipients.length === 0) {
      toast.error('送信先を選択してください');
      return;
    }

    const ccList = parseCcBcc(ccInput);
    const bccList = parseCcBcc(bccInput);

    setSending(true);
    try {
      const response = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId,
          meetingId: selectedMeetingId || null,
          templateId: selectedTemplateId || null,
          subject,
          body,
          targetType,
          recipients: recipients.map(r => ({ name: r.name, email: r.email, userId: r.id })),
          cc: ccList.length > 0 ? ccList : undefined,
          bcc: bccList.length > 0 ? bccList : undefined,
          createdBy: userId,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success(`${recipients.length}名にメールを送信しました`);
      router.push('/emails/history');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '送信に失敗しました');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/emails/history">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" />戻る</Button>
        </Link>
        <h1 className="page-title">メール作成</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* テンプレート・例会選択 */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group">
                  <Label>メールテンプレート</Label>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="テンプレートを選択" /></SelectTrigger>
                    <SelectContent>
                      {templates.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="form-group">
                  <Label>例会（変数挿入用）</Label>
                  <Select value={selectedMeetingId} onValueChange={setSelectedMeetingId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="例会を選択" /></SelectTrigger>
                    <SelectContent>
                      {meetings.map(m => (
                        <SelectItem key={String(m.id)} value={String(m.id)}>{String(m.title)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 件名・本文 */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="form-group">
                <Label required>件名</Label>
                <Input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="メールの件名"
                  className="mt-1"
                />
              </div>

              {/* CC/BCC 展開エリア */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowCcBcc(!showCcBcc)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mb-2"
                >
                  {showCcBcc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  CC/BCC を{showCcBcc ? '閉じる' : '追加する'}
                </button>
                {showCcBcc && (
                  <div className="space-y-2 mb-2 p-3 bg-gray-50 rounded-md border border-gray-100">
                    <div className="form-group">
                      <Label className="text-xs">CC（カンマ区切りで複数指定可）</Label>
                      <Input
                        value={ccInput}
                        onChange={e => setCcInput(e.target.value)}
                        placeholder="cc1@example.com, cc2@example.com"
                        className="mt-1 text-sm"
                      />
                    </div>
                    <div className="form-group">
                      <Label className="text-xs">BCC（カンマ区切りで複数指定可）</Label>
                      <Input
                        value={bccInput}
                        onChange={e => setBccInput(e.target.value)}
                        placeholder="bcc1@example.com, bcc2@example.com"
                        className="mt-1 text-sm"
                      />
                    </div>
                    {(ccInput || bccInput) && (
                      <div className="text-xs text-gray-500">
                        {ccInput && <p>CC: {parseCcBcc(ccInput).join(', ') || '（有効なアドレスがありません）'}</p>}
                        {bccInput && <p>BCC: {parseCcBcc(bccInput).join(', ') || '（有効なアドレスがありません）'}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="form-group">
                <Label required>本文</Label>
                <Textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={16}
                  placeholder="メール本文を入力またはテンプレートを選択"
                  className="mt-1 font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 送信設定 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                送信先設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="form-group">
                <Label>送信対象</Label>
                <Select value={targetType} onValueChange={setTargetType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全員 ({members.length}名)</SelectItem>
                    <SelectItem value="rac">
                      大阪北RACメンバー ({members.filter(m => m.member_type === 'RAC').length}名)
                    </SelectItem>
                    <SelectItem value="rc">
                      RC ({members.filter(m => m.member_type === 'RC').length}名)
                    </SelectItem>
                    <SelectItem value="obog">
                      OB・OG ({members.filter(m => m.member_type === 'OB_OG').length}名)
                    </SelectItem>
                    {selectedMeetingId && (
                      <SelectItem value="meeting_attendees">
                        この例会の参加者{loadingAttendees ? '（取得中…）' : `（${meetingAttendees.length}名）`}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  送信先: {recipients.length}名
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {recipients.slice(0, 10).map(r => (
                    <div key={r.id} className="text-xs text-gray-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                      {r.name} &lt;{r.email}&gt;
                    </div>
                  ))}
                  {recipients.length > 10 && (
                    <p className="text-xs text-gray-400">...他 {recipients.length - 10}名</p>
                  )}
                </div>
              </div>

              {/* CC/BCC サマリー */}
              {(parseCcBcc(ccInput).length > 0 || parseCcBcc(bccInput).length > 0) && (
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                  <p className="font-medium flex items-center gap-1">
                    <Mail className="h-3 w-3" />CC/BCC設定済み
                  </p>
                  {parseCcBcc(ccInput).length > 0 && (
                    <p>CC: {parseCcBcc(ccInput).length}件</p>
                  )}
                  {parseCcBcc(bccInput).length > 0 && (
                    <p>BCC: {parseCcBcc(bccInput).length}件</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button
              onClick={handleSend}
              loading={loading}
              className="w-full"
              size="lg"
            >
              <Send className="h-4 w-4" />
              {recipients.length}名に送信する
            </Button>
            <p className="text-xs text-gray-500 text-center">
              送信前に必ず内容をご確認ください
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
