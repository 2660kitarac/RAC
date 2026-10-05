'use client';

/**
 * 地区役員アカウントの一覧・追加・変更
 *  - 追加：新しいアカウントを作る ／ 既存の会員を地区役員にする
 *  - 変更：氏名・役職・パスワード再設定・停止／再開・地区役員から外す
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, KeyRound, Pencil, Plus, Shuffle, UserMinus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { DISTRICT_OFFICER_ROLES } from '@/lib/auth/tenant';
import { USER_ROLE_LABELS, type UserRole } from '@/types';
import { cn } from '@/lib/utils';

export type Officer = {
  id: string;
  name: string;
  email: string;
  role: string;
  clubId: string | null;
  clubName: string | null;
  districtId: string | null;
  isActive: boolean;
};

type Props = {
  initialOfficers: Officer[];
  clubs: { id: string; name: string }[];
  me: { id: string; role: string };
  canManage: boolean;
};

const PASSWORD_MIN = 8;

function roleLabel(role: string): string {
  return USER_ROLE_LABELS[role as UserRole] ?? role;
}

/** 紛らわしい文字（0/O, 1/l/I など）を除いた10文字のパスワード */
function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => chars[n % chars.length]).join('');
}

const selectClass = 'h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm disabled:bg-gray-50 disabled:text-gray-500';

/** パスワード入力（表示切替・ランダム生成つき） */
function PasswordField({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="pr-10"
            maxLength={72}
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-500 hover:text-gray-800"
            aria-label={show ? 'パスワードを隠す' : 'パスワードを表示'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button type="button" variant="outline" onClick={() => { onChange(randomPassword()); setShow(true); }}>
          <Shuffle className="h-4 w-4" />ランダム生成
        </Button>
      </div>
      <p className="text-xs text-gray-500">{PASSWORD_MIN}文字以上。決めたパスワードは本人に直接お伝えください。</p>
    </div>
  );
}

export default function OfficersManager({ initialOfficers, clubs, me, canManage }: Props) {
  const [officers, setOfficers] = useState<Officer[]>(initialOfficers);
  const canGrantAdmin = me.role === 'system_owner' || me.role === 'district_admin';
  const roleOptions = DISTRICT_OFFICER_ROLES.filter(r => r !== 'district_admin' || canGrantAdmin);

  // ── 追加ダイアログ ──
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<'create' | 'promote'>('create');
  const [addForm, setAddForm] = useState({ name: '', email: '', role: 'district_secretary', password: '', clubId: '' });
  const [adding, setAdding] = useState(false);

  // ── 変更ダイアログ ──
  const [editTarget, setEditTarget] = useState<Officer | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: '', password: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: 'remove' | 'stop' | 'resume'; officer: Officer }>(null);
  const [confirming, setConfirming] = useState(false);

  const upsert = (o: Officer) => setOfficers(prev => {
    const exists = prev.some(p => p.id === o.id);
    return exists ? prev.map(p => (p.id === o.id ? o : p)) : [...prev, o];
  });

  const openAdd = () => {
    setAddMode('create');
    setAddForm({ name: '', email: '', role: 'district_secretary', password: '', clubId: '' });
    setAddOpen(true);
  };

  const submitAdd = async () => {
    const email = addForm.email.trim();
    if (addMode === 'create' && !addForm.name.trim()) { toast.error('氏名を入力してください'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('メールアドレスを正しく入力してください'); return; }
    if (addMode === 'create' && addForm.password.length < PASSWORD_MIN) {
      toast.error(`初期パスワードは${PASSWORD_MIN}文字以上で入力してください`);
      return;
    }
    setAdding(true);
    try {
      const payload = addMode === 'create'
        ? { mode: 'create', name: addForm.name.trim(), email, role: addForm.role, password: addForm.password, clubId: addForm.clubId || null }
        : { mode: 'promote', email, role: addForm.role };
      const res = await fetch('/api/district/officers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '追加に失敗しました');
      if (data.officer) upsert(data.officer as Officer);
      toast.success(addMode === 'create' ? '地区役員のアカウントを作成しました' : '地区役員に設定しました');
      setAddOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (o: Officer) => {
    setEditTarget(o);
    setEditForm({ name: o.name, role: o.role, password: '' });
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/district/officers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '変更に失敗しました');
    return data as { officer?: Officer; removed?: boolean; result?: 'member' | 'deactivated' };
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim()) { toast.error('氏名を入力してください'); return; }
    if (editForm.password && editForm.password.length < PASSWORD_MIN) {
      toast.error(`新しいパスワードは${PASSWORD_MIN}文字以上で入力してください`);
      return;
    }
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = { name: editForm.name.trim() };
      if (editForm.role !== editTarget.role) body.role = editForm.role;
      if (editForm.password) body.password = editForm.password;
      const data = await patch(editTarget.id, body);
      if (data.officer) upsert(data.officer);
      toast.success(editForm.password ? '変更を保存しました（新しいパスワードを本人に伝えてください）' : '変更を保存しました');
      setEditTarget(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirming(true);
    try {
      const { kind, officer } = confirm;
      if (kind === 'remove') {
        const data = await patch(officer.id, { action: 'remove' });
        if (data.result === 'member') {
          setOfficers(prev => prev.filter(p => p.id !== officer.id));
          toast.success(`${officer.name}さんを地区役員から外し、個人会員に戻しました`);
        } else {
          setOfficers(prev => prev.map(p => (p.id === officer.id ? { ...p, isActive: false } : p)));
          toast.success(`${officer.name}さんのアカウントを停止しました`);
        }
      } else {
        const data = await patch(officer.id, { isActive: kind === 'resume' });
        if (data.officer) upsert(data.officer);
        toast.success(kind === 'resume' ? 'アカウントを再開しました' : 'アカウントを停止しました');
      }
      setConfirm(null);
      setEditTarget(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  /** この行を変更できるか（地区管理者の行は地区管理者だけ。自分の行は氏名・パスワードのみ） */
  const canEditRow = (o: Officer) => canManage && (o.role !== 'district_admin' || canGrantAdmin || o.id === me.id);

  const activeCount = officers.filter(o => o.isActive).length;

  return (
    <div className="space-y-4">
      {!canManage && (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          地区役員の追加・変更は、地区管理者または地区代表が行います。変更が必要なときはご連絡ください。
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <Users className="h-4 w-4 text-indigo-600" />
          有効なアカウント {activeCount}人{officers.length > activeCount && `（停止中 ${officers.length - activeCount}人）`}
        </p>
        {canManage && (
          <Button onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4" />地区役員を追加
          </Button>
        )}
      </div>

      {officers.length === 0 ? (
        <Card className="p-10 text-center text-gray-500">
          <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-700">地区役員のアカウントはまだありません</p>
          {canManage && <p className="mt-1 text-sm">「地区役員を追加」から、地区幹事・地区会計などのアカウントを作成できます。</p>}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="rac-table w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">氏名</th>
                <th className="px-4 py-2 font-medium">役職</th>
                <th className="px-4 py-2 font-medium">メール（ログインID）</th>
                <th className="px-4 py-2 font-medium">所属クラブ</th>
                <th className="px-4 py-2 font-medium">状態</th>
                {canManage && <th className="px-4 py-2 font-medium text-right">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {officers.map(o => (
                <tr key={o.id} className={cn(!o.isActive && 'bg-gray-50 text-gray-500')}>
                  <td data-label="氏名" data-cell="primary" className="px-4 py-3 font-medium text-gray-900">
                    {o.name}
                    {o.id === me.id && <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-normal text-indigo-700">あなた</span>}
                  </td>
                  <td data-label="役職" className="px-4 py-3">
                    <span className={cn(
                      'rounded px-1.5 py-0.5 text-xs font-medium',
                      o.role === 'district_admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700',
                    )}>
                      {roleLabel(o.role)}
                    </span>
                  </td>
                  <td data-label="メール" className="px-4 py-3 break-all">{o.email}</td>
                  <td data-label="所属クラブ" className="px-4 py-3">{o.clubName || '—'}</td>
                  <td data-label="状態" className="px-4 py-3">
                    {o.isActive
                      ? <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">有効</span>
                      : <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">停止</span>}
                  </td>
                  {canManage && (
                    <td data-label="" data-cell="actions" className="px-4 py-3 text-right">
                      {canEditRow(o) ? (
                        <Button size="sm" variant="outline" onClick={() => openEdit(o)}>
                          <Pencil className="h-3.5 w-3.5" />変更
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-400">地区管理者のみ変更可</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* 追加ダイアログ */}
      <Dialog open={addOpen} onOpenChange={o => !adding && setAddOpen(o)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>地区役員を追加</DialogTitle>
            <DialogDescription>地区役員として地区の画面にログインできるようになります。</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1" role="tablist">
            {([['create', '新しいアカウントを作る'], ['promote', '既存の会員を地区役員にする']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={addMode === k}
                onClick={() => setAddMode(k)}
                className={cn(
                  'rounded-md px-2 py-1.5 text-xs font-medium sm:text-sm',
                  addMode === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-4 py-1">
            {addMode === 'create' && (
              <div className="space-y-1.5">
                <Label htmlFor="of-name" required>氏名</Label>
                <Input id="of-name" value={addForm.name} maxLength={50}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="例：山田 花子" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="of-email" required>メールアドレス（ログインID）</Label>
              <Input id="of-email" type="email" inputMode="email" autoComplete="off" value={addForm.email} maxLength={254}
                onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="example@example.com" />
              {addMode === 'promote' && (
                <p className="text-xs text-gray-500">RAC Cloud にすでに登録されている会員のメールアドレスを、正確に入力してください。</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-role" required>役職</Label>
              <select id="of-role" className={selectClass} value={addForm.role}
                onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}>
                {roleOptions.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>
            {addMode === 'create' && (
              <>
                <PasswordField id="of-password" label="初期パスワード" value={addForm.password}
                  onChange={v => setAddForm(f => ({ ...f, password: v }))} />
                <div className="space-y-1.5">
                  <Label htmlFor="of-club">所属クラブ（任意）</Label>
                  <select id="of-club" className={selectClass} value={addForm.clubId}
                    onChange={e => setAddForm(f => ({ ...f, clubId: e.target.value }))}>
                    <option value="">所属なし</option>
                    {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>キャンセル</Button>
            <Button onClick={submitAdd} loading={adding} className="bg-indigo-600 hover:bg-indigo-700">
              {addMode === 'create' ? 'アカウントを作成' : '地区役員にする'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 変更ダイアログ */}
      <Dialog open={!!editTarget && !confirm} onOpenChange={o => !o && !editSaving && setEditTarget(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget?.name}さんのアカウント</DialogTitle>
            <DialogDescription>ログインID：{editTarget?.email}</DialogDescription>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="ed-name" required>氏名</Label>
                <Input id="ed-name" value={editForm.name} maxLength={50}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-role">役職</Label>
                <select
                  id="ed-role"
                  className={selectClass}
                  value={editForm.role}
                  disabled={editTarget.id === me.id}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                >
                  {/* 地区管理者を任命できない人でも、現在の役職は表示する */}
                  {(roleOptions.includes(editTarget.role as (typeof roleOptions)[number]) ? roleOptions : [editTarget.role, ...roleOptions])
                    .map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
                {editTarget.id === me.id && <p className="text-xs text-gray-500">自分自身の役職は変更できません。</p>}
              </div>
              <div className="rounded-md border border-gray-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  <KeyRound className="h-4 w-4 text-gray-500" />パスワードの再設定
                </p>
                <PasswordField id="ed-password" label="新しいパスワード（変更しない場合は空欄）" value={editForm.password}
                  onChange={v => setEditForm(f => ({ ...f, password: v }))} />
              </div>

              {editTarget.id !== me.id && (
                <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                  {editTarget.isActive ? (
                    <Button type="button" variant="outline" className="flex-1"
                      onClick={() => setConfirm({ kind: 'stop', officer: editTarget })}>
                      アカウントを停止
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="flex-1"
                      onClick={() => setConfirm({ kind: 'resume', officer: editTarget })}>
                      アカウントを再開
                    </Button>
                  )}
                  <Button type="button" variant="ghost" className="flex-1 text-red-600 hover:bg-red-50"
                    onClick={() => setConfirm({ kind: 'remove', officer: editTarget })}>
                    <UserMinus className="h-4 w-4" />地区役員から外す
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>キャンセル</Button>
            <Button onClick={submitEdit} loading={editSaving} className="bg-indigo-600 hover:bg-indigo-700">保存する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 確認ダイアログ（停止・再開・地区役員から外す） */}
      <Dialog open={!!confirm} onOpenChange={o => !o && !confirming && setConfirm(null)}>
        <DialogContent className="max-w-md">
          {confirm && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirm.kind === 'remove' && `${confirm.officer.name}さんを地区役員から外しますか？`}
                  {confirm.kind === 'stop' && `${confirm.officer.name}さんのアカウントを停止しますか？`}
                  {confirm.kind === 'resume' && `${confirm.officer.name}さんのアカウントを再開しますか？`}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm text-gray-600">
                    {confirm.kind === 'remove' && (confirm.officer.clubId ? (
                      <p>
                        地区の画面は使えなくなり、所属クラブ（{confirm.officer.clubName ?? 'クラブ'}）の個人会員に戻ります。
                        クラブ側のログインはそのまま使えます。
                      </p>
                    ) : (
                      <p>
                        この方はクラブに所属していないため、アカウントを停止します（ログインできなくなります）。
                        あとから「アカウントを再開」で元に戻せます。
                      </p>
                    ))}
                    {confirm.kind === 'stop' && <p>停止するとログインできなくなります。データは消えず、あとから再開できます。</p>}
                    {confirm.kind === 'resume' && <p>再開すると、これまでのメールアドレスとパスワードで再びログインできます。</p>}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setConfirm(null)} disabled={confirming}>キャンセル</Button>
                <Button
                  variant={confirm.kind === 'resume' ? 'default' : 'destructive'}
                  onClick={runConfirm}
                  loading={confirming}
                >
                  {confirm.kind === 'remove' ? '外す' : confirm.kind === 'stop' ? '停止する' : '再開する'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
