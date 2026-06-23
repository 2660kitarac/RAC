'use client';

import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { UserRole } from '@/types';
import { canSendEmails } from '@/lib/hooks/useAuth';
import { Mail, Plus, Pencil, Trash2 } from 'lucide-react';

// APIレスポンスに合わせたローカル型（キャメルケース）
interface EmailTemplate {
  id: string;
  clubId: string | null;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  isDefault: boolean;
  isSystem?: boolean;
  createdAt: string;
}

interface EmailTemplatesManagerProps {
  templates: EmailTemplate[];
  clubId: string;
  userRole: UserRole;
}

// テンプレート変数の説明
const TEMPLATE_VARIABLES = [
  { key: '{{name}}', desc: '参加者名' },
  { key: '{{club_name}}', desc: 'クラブ名' },
  { key: '{{meeting_title}}', desc: '例会タイトル' },
  { key: '{{meeting_date}}', desc: '開催日' },
  { key: '{{meeting_venue}}', desc: '会場名' },
  { key: '{{registration_url}}', desc: 'MU登録URL' },
  { key: '{{fee_amount}}', desc: '参加費' },
  { key: '{{deadline}}', desc: '申込締切日' },
];

export default function EmailTemplatesManager({ templates: initialTemplates, clubId, userRole }: EmailTemplatesManagerProps) {
  const canManage = canSendEmails(userRole);

  const [templates, setTemplates] = useState<EmailTemplate[]>(initialTemplates);
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  const [form, setForm] = useState({ name: '', subject: '', body: '' });

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: '', subject: '', body: '' });
    setShowDialog(true);
  };

  const openEdit = (t: EmailTemplate) => {
    setEditTarget(t);
    setForm({ name: t.name, subject: t.subjectTemplate, body: t.bodyTemplate });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('テンプレート名を入力してください'); return; }
    if (!form.subject.trim()) { toast.error('件名を入力してください'); return; }
    if (!form.body.trim()) { toast.error('本文を入力してください'); return; }

    setLoading(true);
    try {
      if (editTarget) {
        // 更新
        const response = await fetch(`/api/emails/templates/${editTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            subjectTemplate: form.subject,
            bodyTemplate: form.body,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '更新に失敗しました');

        setTemplates(prev => prev.map(t =>
          t.id === editTarget.id
            ? { ...t, name: form.name, subjectTemplate: form.subject, bodyTemplate: form.body }
            : t
        ));
        toast.success('テンプレートを更新しました');
      } else {
        // 新規作成
        const response = await fetch('/api/emails/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clubId,
            name: form.name,
            subjectTemplate: form.subject,
            bodyTemplate: form.body,
            templateType: 'custom',
            isDefault: false,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '作成に失敗しました');

        const newTemplate: EmailTemplate = {
          id: data.id,
          clubId,
          name: form.name,
          subjectTemplate: form.subject,
          bodyTemplate: form.body,
          isDefault: false,
          createdAt: new Date().toISOString(),
        };
        setTemplates(prev => [...prev, newTemplate]);
        toast.success('テンプレートを作成しました');
      }
      setShowDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/emails/templates/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '削除に失敗しました');

      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('テンプレートを削除しました');
      setShowDeleteConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const insertVariable = (varKey: string) => {
    setForm(f => ({ ...f, body: f.body + varKey }));
  };

  return (
    <div className="space-y-6">
      {/* テンプレート変数ガイド */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-blue-800 mb-2">使用可能なテンプレート変数</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_VARIABLES.map(v => (
              <span key={v.key} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-mono">
                {v.key}
                <span className="text-blue-500 font-sans">=</span>
                <span className="font-sans">{v.desc}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              テンプレート一覧
            </CardTitle>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />新規作成
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Mail className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p>テンプレートがありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(t => (
                <div key={t.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{t.name}</p>
                        {t.isDefault && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">デフォルト</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">件名: {t.subjectTemplate}</p>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{t.bodyTemplate}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost"
                        onClick={() => setPreviewTemplate(t)}>
                        プレビュー
                      </Button>
                      {canManage && !t.isDefault && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => setShowDeleteConfirm(t.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 作成・編集ダイアログ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'テンプレートを編集' : '新規テンプレート作成'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label required>テンプレート名</Label>
              <Input placeholder="例：例会案内メール"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label required>件名</Label>
              <Input placeholder="例：【大阪北RAC】{{meeting_title}} のご案内"
                value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label required>本文</Label>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.slice(0, 4).map(v => (
                    <button key={v.key}
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-1.5 py-0.5 rounded font-mono">
                      {v.key}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                placeholder={`{{name}} 様\n\nいつも大阪北ローターアクトクラブをご支援いただきありがとうございます。\n\n{{meeting_title}} のご案内をお送りします。\n\n開催日: {{meeting_date}}\n会場: {{meeting_venue}}`}
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={12}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>キャンセル</Button>
            <Button onClick={handleSubmit} loading={loading}>
              {editTarget ? '更新する' : '作成する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* プレビューダイアログ */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>テンプレートプレビュー: {previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500 mb-1">件名</p>
                <p className="text-sm font-medium">{previewTemplate.subjectTemplate}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500 mb-1">本文</p>
                <pre className="text-sm whitespace-pre-wrap font-sans">{previewTemplate.bodyTemplate}</pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>テンプレートの削除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">このテンプレートを削除しますか？この操作は元に戻せません。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>キャンセル</Button>
            <Button variant="destructive"
              onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
              loading={loading}>
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
