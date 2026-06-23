'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, User, LogOut, Save } from 'lucide-react';

export default function MyProfilePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { data: session, status } = useSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    name_kana: '',
    birth_date: '',
    phone: '',
    address_zip: '',
    address: '',
    occupation: '',
    allergy: '',
    dietary_note: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user) { router.push(`/club/${slug}/login`); return; }

    // プロフィール取得
    fetch('/api/profile')
      .then(r => r.json())
      .then((data) => {
        if (data.profile) {
          setForm({
            name: data.profile.name || '',
            name_kana: data.profile.name_kana || '',
            birth_date: data.profile.birth_date || '',
            phone: data.profile.phone || '',
            address_zip: data.profile.address_zip || '',
            address: data.profile.address || '',
            occupation: data.profile.occupation || '',
            allergy: data.profile.allergy || '',
            dietary_note: data.profile.dietary_note || '',
            emergency_contact_name: data.profile.emergency_contact_name || '',
            emergency_contact_phone: data.profile.emergency_contact_phone || '',
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [status, session, slug, router]);

  const handleSave = async () => {
    if (!form.name) { toast.error('お名前を入力してください'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      toast.success('プロフィールを保存しました');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: `/club/${slug}` });
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/club/${slug}/dashboard`} className="p-1.5 rounded-full hover:bg-gray-100">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <User className="h-4 w-4 text-gray-600" /> プロフィール
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition-colors"
          >
            <LogOut className="h-4 w-4" /> ログアウト
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* 基本情報 */}
        <section className="bg-white rounded-xl border p-4 space-y-4">
          <h2 className="text-sm font-bold text-gray-700 border-b pb-2">基本情報</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group col-span-2 sm:col-span-1">
              <Label htmlFor="name" required>お名前</Label>
              <Input id="name" value={form.name} onChange={set('name')} className="mt-1" />
            </div>
            <div className="form-group col-span-2 sm:col-span-1">
              <Label htmlFor="name_kana">フリガナ</Label>
              <Input id="name_kana" value={form.name_kana} onChange={set('name_kana')} placeholder="ヤマダ タロウ" className="mt-1" />
            </div>
          </div>
          <div className="form-group">
            <Label htmlFor="birth_date">生年月日</Label>
            <Input id="birth_date" type="date" value={form.birth_date} onChange={set('birth_date')} className="mt-1" />
          </div>
          <div className="form-group">
            <Label htmlFor="phone">電話番号</Label>
            <Input id="phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="090-0000-0000" className="mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="form-group col-span-1">
              <Label htmlFor="address_zip">郵便番号</Label>
              <Input id="address_zip" value={form.address_zip} onChange={set('address_zip')} placeholder="530-0001" className="mt-1" />
            </div>
            <div className="form-group col-span-2">
              <Label htmlFor="address">住所</Label>
              <Input id="address" value={form.address} onChange={set('address')} className="mt-1" />
            </div>
          </div>
          <div className="form-group">
            <Label htmlFor="occupation">会社・学校名（任意）</Label>
            <Input id="occupation" value={form.occupation} onChange={set('occupation')} placeholder="〇〇株式会社 / 〇〇大学" className="mt-1" />
          </div>
        </section>

        {/* 食事・健康情報 */}
        <section className="bg-white rounded-xl border p-4 space-y-4">
          <h2 className="text-sm font-bold text-gray-700 border-b pb-2">食事・健康情報</h2>
          <div className="form-group">
            <Label htmlFor="allergy">食物アレルギー</Label>
            <Input id="allergy" value={form.allergy} onChange={set('allergy')} placeholder="例: 卵、小麦（ない場合は空欄）" className="mt-1" />
          </div>
          <div className="form-group">
            <Label htmlFor="dietary_note">食事のその他注意事項</Label>
            <Textarea id="dietary_note" value={form.dietary_note} onChange={set('dietary_note')} placeholder="ベジタリアン、ハラール対応など" rows={2} className="mt-1" />
          </div>
        </section>

        {/* 緊急連絡先 */}
        <section className="bg-white rounded-xl border p-4 space-y-4">
          <h2 className="text-sm font-bold text-gray-700 border-b pb-2">緊急連絡先（任意）</h2>
          <div className="form-group">
            <Label htmlFor="emergency_contact_name">氏名</Label>
            <Input id="emergency_contact_name" value={form.emergency_contact_name} onChange={set('emergency_contact_name')} placeholder="山田 花子（続柄: 母）" className="mt-1" />
          </div>
          <div className="form-group">
            <Label htmlFor="emergency_contact_phone">電話番号</Label>
            <Input id="emergency_contact_phone" type="tel" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} placeholder="090-0000-0000" className="mt-1" />
          </div>
        </section>

        {/* 保存ボタン */}
        <Button onClick={handleSave} loading={saving} className="w-full" size="lg">
          <Save className="h-4 w-4 mr-2" /> 保存する
        </Button>
      </div>
    </div>
  );
}
