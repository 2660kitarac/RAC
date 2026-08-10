'use client';

/**
 * 会員パスワード再設定ダイアログ（クラブアカウントによる代理リセット）
 *
 * 2つのモードを提供:
 *   1. 自動生成 … 仮パスワードを生成し、画面に表示して本人へ伝える
 *   2. 手動指定 … 管理者が任意のパスワードを設定する
 *
 * API: POST /api/members/[id]/password
 */

import { useState } from 'react';
import {
  KeyRound, Copy, Check, AlertTriangle, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

type TargetMember = {
  id: string;
  name: string;
  email: string;
};

type Props = {
  member: TargetMember | null;
  onClose: () => void;
};

export default function ResetPasswordDialog({ member, onClose }: Props) {
  const [mode, setMode] = useState<'generate' | 'manual'>('generate');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setMode('generate');
    setPassword('');
    setConfirm('');
    setShowPassword(false);
    setIssued(null);
    setCopied(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!member) return;

    // 手動指定モードのクライアント側検証
    if (mode === 'manual') {
      if (password.length < 8) {
        toast.error('パスワードは8文字以上で設定してください');
        return;
      }
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        toast.error('パスワードは英字と数字をそれぞれ1文字以上含めてください');
        return;
      }
      if (password !== confirm) {
        toast.error('パスワードが一致しません');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${member.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'generate' ? { generate: true } : { newPassword: password }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'パスワードの再設定に失敗しました');
        return;
      }

      toast.success(`${member.name} さんのパスワードを再設定しました`);
      // 自動生成の場合は平文を表示して伝達できるようにする
      setIssued(data.temporaryPassword ?? password);
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  const copyPassword = () => {
    if (!issued) return;
    navigator.clipboard.writeText(issued)
      .then(() => {
        setCopied(true);
        toast.success('パスワードをコピーしました');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error('コピーに失敗しました'));
  };

  return (
    <Dialog open={!!member} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-600" />
            パスワードを再設定
          </DialogTitle>
        </DialogHeader>

        {!member ? null : issued ? (
          /* ---- 再設定完了：新しいパスワードを表示 ---- */
          <div className="space-y-4">
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <p className="font-medium">{member.name} さんのパスワードを再設定しました</p>
              <p className="text-green-700 text-xs mt-1">
                以下のパスワードを本人にお伝えください。この画面を閉じると再表示できません。
              </p>
            </div>

            <div>
              <Label>新しいパスワード</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <code className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-base tracking-wider select-all">
                  {issued}
                </code>
                <Button variant="outline" size="sm" onClick={copyPassword}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                本人にはログイン後、設定画面から任意のパスワードへ変更するようご案内ください。
              </p>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>閉じる</Button>
            </DialogFooter>
          </div>
        ) : (
          /* ---- 再設定フォーム ---- */
          <div className="space-y-4">
            <div className="text-sm">
              <p className="font-medium text-gray-900">{member.name}</p>
              <p className="text-gray-500 text-xs mt-0.5">{member.email}</p>
            </div>

            {/* モード切替 */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('generate')}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  mode === 'generate'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                自動生成
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  mode === 'manual'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                手動で指定
              </button>
            </div>

            {mode === 'generate' ? (
              <p className="text-xs text-gray-600 rounded-md bg-gray-50 border border-gray-200 p-3">
                安全な仮パスワードを自動生成します。生成後に画面へ表示されるので、
                本人にお伝えください。
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label required>新しいパスワード</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="8文字以上（英字と数字を含む）"
                      autoComplete="new-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      title={showPassword ? '隠す' : '表示'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label required>新しいパスワード（確認）</Label>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="同じパスワードを入力"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                再設定すると、本人の現在のパスワードは使用できなくなります。
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                キャンセル
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    再設定する
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
