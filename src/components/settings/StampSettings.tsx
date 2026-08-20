'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ReceiptStamp from '@/components/receipts/ReceiptStamp';
import { Stamp, Upload, Trash2 } from 'lucide-react';

interface StampSettingsProps {
  clubId: string;
  clubName: string;
  initialStampImageUrl?: string | null;
  initialStampText?: string | null;
  initialStampEnabled?: boolean;
}

/** 画像をリサイズして data URL (PNG) に変換する */
async function fileToResizedDataUrl(file: File, maxSize = 400): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした'));
    image.src = dataUrl;
  });

  // 正方形にトリミングせず、長辺を maxSize に合わせる
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像処理に失敗しました');
  ctx.drawImage(img, 0, 0, w, h);

  // 透過を保持するため PNG で出力
  return canvas.toDataURL('image/png');
}

export default function StampSettings({
  clubId,
  clubName,
  initialStampImageUrl,
  initialStampText,
  initialStampEnabled,
}: StampSettingsProps) {
  const [enabled, setEnabled] = useState(!!initialStampEnabled);
  const [imageUrl, setImageUrl] = useState<string | null>(initialStampImageUrl ?? null);
  const [text, setText] = useState(initialStampText ?? '');
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error('PNG / JPEG / WebP 形式の画像を選択してください');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('画像サイズは5MB以下にしてください');
      return;
    }

    setProcessing(true);
    try {
      const resized = await fileToResizedDataUrl(file, 400);
      // data URL が大きすぎる場合はさらに縮小
      if (resized.length > 900_000) {
        const smaller = await fileToResizedDataUrl(file, 240);
        if (smaller.length > 900_000) {
          throw new Error('画像を十分に圧縮できませんでした。より小さい画像をお試しください');
        }
        setImageUrl(smaller);
      } else {
        setImageUrl(resized);
      }
      setEnabled(true);
      toast.success('印影画像を読み込みました。「印鑑設定を保存」を押してください');
    } catch (err: any) {
      toast.error(err?.message ?? '画像の処理に失敗しました');
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (enabled && !imageUrl && !text.trim()) {
      toast.error('印影画像をアップロードするか、印影文字を入力してください');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'stamp',
          clubId,
          stampEnabled: enabled,
          stampImageUrl: imageUrl,
          stampText: text.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success('印鑑設定を保存しました');
    } catch (err: any) {
      toast.error(err?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const previewStamp = {
    stampEnabled: enabled,
    stampImageUrl: imageUrl,
    stampText: text.trim() || null,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Stamp className="h-4 w-4 text-red-600" />
          領収書の電子印鑑
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-gray-500">
          設定した印影は、領収書の単票印刷・一括印刷・会員マイページの領収書すべてに反映されます。
        </p>

        {/* 有効化スイッチ */}
        <label className="flex items-start gap-3 cursor-pointer border rounded-lg p-4 bg-red-50">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="h-4 w-4 mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">電子印鑑を領収書に押印する</p>
            <p className="text-xs text-gray-500">
              OFF の場合は従来どおり空の印枠が印字され、手押しの実印を押せます。
            </p>
          </div>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
          <div className="space-y-4">
            {/* 印影画像 */}
            <div className="space-y-1.5">
              <Label>印影画像（推奨）</Label>
              <p className="text-xs text-gray-500">
                実印をスキャン／撮影した画像をアップロードします。背景が透過した PNG が最もきれいに印字されます。
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="stamp-file-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={processing}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {processing ? '処理中...' : imageUrl ? '画像を変更' : '画像をアップロード'}
                </Button>
                {imageUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setImageUrl(null)}
                  >
                    <Trash2 className="h-4 w-4" />
                    画像を削除
                  </Button>
                )}
              </div>
            </div>

            {/* 印影文字 */}
            <div className="space-y-1.5">
              <Label>印影文字（画像がない場合）</Label>
              <Input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={clubName || '大阪北RAC'}
                maxLength={8}
              />
              <p className="text-xs text-gray-500">
                最大8文字。入力した文字から朱色の丸印を自動生成します（画像がある場合は画像が優先されます）。
              </p>
            </div>
          </div>

          {/* プレビュー */}
          <div className="flex flex-col items-center gap-2 rounded-lg border bg-gray-50 p-5 min-w-[140px]">
            <p className="text-xs text-gray-500">プレビュー</p>
            <ReceiptStamp stamp={previewStamp} size="80px" />
            <p className="text-[10px] text-gray-400 text-center leading-tight">
              領収書には
              <br />
              約11mm で印字されます
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={handleSave} disabled={saving || processing}>
            {saving ? '保存中...' : '印鑑設定を保存'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
