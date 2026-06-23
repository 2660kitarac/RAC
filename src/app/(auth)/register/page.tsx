'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { registerUser } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ChevronRight, ChevronLeft, CheckCircle, Clock, Mail } from 'lucide-react';

type Step = 1 | 2 | 3;
const STEP_LABELS = ['アカウント情報', '個人情報', '例会・健康情報'];

interface Club {
  id: string;
  name: string;
  shortName: string | null;
}

export default function RegisterPage() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [registered, setRegistered] = useState(false);  // 登録完了フラグ
  const [registeredClubName, setRegisteredClubName] = useState('');

  // Step 1
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2
  const [name, setName] = useState('');
  const [nameKana, setNameKana] = useState('');
  const [clubId, setClubId] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [address, setAddress] = useState('');
  const [occupation, setOccupation] = useState('');

  // Step 3
  const [allergy, setAllergy] = useState('');
  const [dietaryNote, setDietaryNote] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // クラブ一覧取得（公開APIが必要なため、ここでは /api/clubs/public を使うか、
  // 暫定的に /api/attendances 経由で clubs テーブルを参照）
  useEffect(() => {
    fetch('/api/clubs/public')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setClubs(data);
      })
      .catch(() => {});
  }, []);

  const validateStep1 = () => {
    if (!email) { toast.error('メールアドレスを入力してください'); return false; }
    if (!password) { toast.error('パスワードを入力してください'); return false; }
    if (password.length < 8) { toast.error('パスワードは8文字以上にしてください'); return false; }
    if (password !== confirmPassword) { toast.error('パスワードが一致しません'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!name) { toast.error('お名前を入力してください'); return false; }
    if (!phone) { toast.error('電話番号を入力してください'); return false; }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => (s + 1) as Step);
  };

  const handleBack = () => setStep((s) => (s - 1) as Step);

  const handleRegister = async () => {
    setLoading(true);
    try {
      const result = await registerUser({
        email,
        password,
        name,
        nameKana: nameKana || undefined,
        phone,
        clubId: clubId || undefined,
        birthDate: birthDate || undefined,
        addressZip: addressZip || undefined,
        address: address || undefined,
        occupation: occupation || undefined,
        allergy: allergy || undefined,
        dietaryNote: dietaryNote || undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
      });

      if (result?.error) {
        toast.error('登録に失敗しました', { description: result.error });
        return;
      }

      // 登録完了 → 承認待ち画面へ（自動ログインしない）
      const club = clubs.find(c => c.id === clubId);
      setRegisteredClubName(club?.name || '');
      setRegistered(true);
    } catch {
      toast.error('登録処理中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const selectedClub = clubs.find(c => c.id === clubId);

  // ====== 登録完了 → 承認待ち画面 ======
  if (registered) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="shadow-xl border-0">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center">
                  <Clock className="h-10 w-10 text-amber-500" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                登録が完了しました！
              </h2>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4 mb-6 text-left">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800 text-sm">クラブの承認待ちです</p>
                    <p className="text-amber-700 text-sm mt-1">
                      {registeredClubName
                        ? `「${registeredClubName}」のクラブアカウントが承認すると、ログインできるようになります。`
                        : 'クラブアカウントが承認するとログインできるようになります。'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
                <div className="flex items-start gap-2">
                  <Mail className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-800 text-sm">次のステップ</p>
                    <ol className="text-blue-700 text-sm mt-1 space-y-1 list-decimal list-inside">
                      <li>クラブ担当者に登録した旨をお伝えください</li>
                      <li>承認後にログインページからサインインできます</li>
                    </ol>
                  </div>
                </div>
              </div>
              <Link href="/login">
                <Button className="w-full" size="lg">
                  ログインページへ
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-3 shadow-lg">
            <span className="text-white font-bold text-2xl">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">RAC Cloud</h1>
          <p className="text-gray-500 text-sm mt-1">新規メンバー登録</p>
        </div>

        {/* ステップインジケーター */}
        <div className="flex items-center justify-center mb-6 gap-2">
          {STEP_LABELS.map((label, i) => {
            const s = (i + 1) as Step;
            const active = s === step;
            const done = s < step;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    done ? 'bg-blue-600 text-white' :
                    active ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {done ? '✓' : s}
                  </div>
                  <span className={`text-xs mt-1 whitespace-nowrap ${active ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`w-8 h-0.5 mb-4 ${done ? 'bg-blue-600' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        <Card className="shadow-xl border-0">
          {/* Step 1 */}
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle className="text-lg">アカウント情報</CardTitle>
                <CardDescription>ログインに使用するメールアドレスとパスワードを設定してください</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="form-group">
                  <Label htmlFor="email" required>メールアドレス</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@racclub.jp" autoComplete="email" className="mt-1" />
                </div>
                <div className="form-group">
                  <Label htmlFor="password" required>パスワード（8文字以上）</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="パスワードを入力" autoComplete="new-password" className="mt-1" />
                </div>
                <div className="form-group">
                  <Label htmlFor="confirmPassword" required>パスワード（確認）</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="パスワードを再入力" autoComplete="new-password" className="mt-1" />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button onClick={handleNext} className="w-full" size="lg">
                  次へ <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <p className="text-sm text-gray-500 text-center">
                  すでにアカウントをお持ちの方は{' '}
                  <Link href="/login" className="text-blue-600 hover:underline font-medium">ログイン</Link>
                </p>
              </CardFooter>
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle className="text-lg">個人情報</CardTitle>
                <CardDescription>例会運営・会員管理に使用します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="form-group col-span-2 sm:col-span-1">
                    <Label htmlFor="name" required>お名前</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎" className="mt-1" />
                  </div>
                  <div className="form-group col-span-2 sm:col-span-1">
                    <Label htmlFor="nameKana">フリガナ</Label>
                    <Input id="nameKana" value={nameKana} onChange={e => setNameKana(e.target.value)} placeholder="ヤマダ タロウ" className="mt-1" />
                  </div>
                </div>

                {/* 所属クラブ選択 */}
                <div className="form-group">
                  <Label htmlFor="clubId">所属クラブ</Label>
                  <Select onValueChange={setClubId} value={clubId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="クラブを選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {clubs.length === 0 && (
                        <SelectItem value="none" disabled>クラブ情報を読み込み中...</SelectItem>
                      )}
                      {clubs.map(club => (
                        <SelectItem key={club.id} value={club.id}>
                          {club.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400 mt-1">
                    所属クラブが一覧にない場合は管理者にお問い合わせください
                  </p>
                </div>

                <div className="form-group">
                  <Label htmlFor="birthDate">生年月日</Label>
                  <Input id="birthDate" type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className="mt-1" />
                </div>
                <div className="form-group">
                  <Label htmlFor="phone" required>電話番号</Label>
                  <Input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-0000-0000" className="mt-1" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="form-group col-span-1">
                    <Label htmlFor="addressZip">郵便番号</Label>
                    <Input id="addressZip" value={addressZip} onChange={e => setAddressZip(e.target.value)} placeholder="530-0001" className="mt-1" />
                  </div>
                  <div className="form-group col-span-2">
                    <Label htmlFor="address">住所</Label>
                    <Input id="address" value={address} onChange={e => setAddress(e.target.value)} placeholder="大阪府大阪市北区..." className="mt-1" />
                  </div>
                </div>
                <div className="form-group">
                  <Label htmlFor="occupation">会社・学校名（任意）</Label>
                  <Input id="occupation" value={occupation} onChange={e => setOccupation(e.target.value)} placeholder="〇〇株式会社 / 〇〇大学" className="mt-1" />
                </div>
              </CardContent>
              <CardFooter className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  <ChevronLeft className="h-4 w-4 mr-1" /> 戻る
                </Button>
                <Button onClick={handleNext} className="flex-1">
                  次へ <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </CardFooter>
            </>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <>
              <CardHeader>
                <CardTitle className="text-lg">例会・健康情報</CardTitle>
                <CardDescription>例会での食事手配・緊急時対応に使用します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="form-group">
                  <Label htmlFor="allergy">食物アレルギー</Label>
                  <Input id="allergy" value={allergy} onChange={e => setAllergy(e.target.value)} placeholder="例: 卵、小麦、えび（ない場合は空欄）" className="mt-1" />
                  <p className="text-xs text-gray-400 mt-1">アレルギーがある場合のみ入力してください</p>
                </div>
                <div className="form-group">
                  <Label htmlFor="dietaryNote">食事に関するその他の注意事項</Label>
                  <Textarea id="dietaryNote" value={dietaryNote} onChange={e => setDietaryNote(e.target.value)} placeholder="例: ベジタリアン、ハラール対応希望など" rows={3} className="mt-1" />
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">緊急連絡先（任意）</p>
                  <div className="space-y-3">
                    <div className="form-group">
                      <Label htmlFor="emergencyContactName">緊急連絡先 氏名</Label>
                      <Input id="emergencyContactName" value={emergencyContactName} onChange={e => setEmergencyContactName(e.target.value)} placeholder="山田 花子（続柄: 母）" className="mt-1" />
                    </div>
                    <div className="form-group">
                      <Label htmlFor="emergencyContactPhone">緊急連絡先 電話番号</Label>
                      <Input id="emergencyContactPhone" type="tel" value={emergencyContactPhone} onChange={e => setEmergencyContactPhone(e.target.value)} placeholder="090-0000-0000" className="mt-1" />
                    </div>
                  </div>
                </div>

                {/* 登録内容確認 */}
                <div className="bg-blue-50 rounded-lg p-4 text-sm space-y-1">
                  <p className="font-medium text-blue-800 mb-2">登録内容の確認</p>
                  <p className="text-blue-700"><span className="text-blue-500">メール:</span> {email}</p>
                  <p className="text-blue-700"><span className="text-blue-500">氏名:</span> {name} {nameKana && `（${nameKana}）`}</p>
                  <p className="text-blue-700"><span className="text-blue-500">電話:</span> {phone}</p>
                  {selectedClub && (
                    <p className="text-blue-700"><span className="text-blue-500">所属クラブ:</span> {selectedClub.name}</p>
                  )}
                  {!clubId && (
                    <p className="text-amber-600 text-xs">※ 所属クラブが未選択です。後から管理者に紐づけを依頼できます。</p>
                  )}
                  {birthDate && <p className="text-blue-700"><span className="text-blue-500">生年月日:</span> {birthDate}</p>}
                  {address && <p className="text-blue-700"><span className="text-blue-500">住所:</span> {addressZip && `〒${addressZip} `}{address}</p>}
                  {allergy && <p className="text-blue-700"><span className="text-blue-500">アレルギー:</span> {allergy}</p>}
                </div>
              </CardContent>
              <CardFooter className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  <ChevronLeft className="h-4 w-4 mr-1" /> 戻る
                </Button>
                <Button onClick={handleRegister} loading={loading} className="flex-1" size="lg">
                  登録する
                </Button>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
