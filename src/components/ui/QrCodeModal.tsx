'use client';

import { useState } from 'react';
import { QrCode, X, Download, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface QrCodeModalProps {
  url: string;
  label?: string;
}

export default function QrCodeModal({ url, label = 'QRコード' }: QrCodeModalProps) {
  const [open, setOpen] = useState(false);

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(url)}`;

  const handleDownload = async () => {
    try {
      const res = await fetch(qrImageUrl);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'qrcode.png';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error('ダウンロードに失敗しました');
    }
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(url);
    toast.success('URLをコピーしました');
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-blue-300 text-blue-700 hover:bg-blue-100 flex-shrink-0"
      >
        <QrCode className="h-4 w-4" />
        QR
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 w-80 max-w-[90vw] flex flex-col items-center gap-4"
            onClick={e => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between w-full">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <QrCode className="h-5 w-5 text-blue-500" />
                {label}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* QRコード画像 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImageUrl}
              alt="QRコード"
              width={240}
              height={240}
              className="rounded-lg border border-gray-200 p-2 bg-white"
            />

            {/* URL表示 */}
            <p className="text-xs text-gray-500 text-center break-all px-2">{url}</p>

            {/* アクションボタン */}
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleCopyUrl}
              >
                <Copy className="h-4 w-4 mr-1" />
                URLコピー
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4 mr-1" />
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
