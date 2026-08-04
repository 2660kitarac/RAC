'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';

type Props = {
  /** 戻り先URL。未指定の場合は history.back() を使用 */
  backHref?: string;
  /** 右側に表示する補足テキスト（例: "A4縦・5枚印刷"） */
  note?: string;
  /** 印刷ボタンのラベル */
  printLabel?: string;
  /** ツールバーを sticky にするか */
  sticky?: boolean;
  /** 内側コンテナの最大幅クラス */
  maxWidthClass?: string;
};

/**
 * 領収書印刷ページ共通ツールバー（Client Component）
 *
 * NOTE: window.print() / history.back() などのイベントハンドラは
 * Server Component から直接渡せないため、必ずこのクライアント
 * コンポーネント側で定義する。
 */
export default function PrintToolbar({
  backHref,
  note,
  printLabel = '印刷 / PDF保存',
  sticky = false,
  maxWidthClass = 'max-w-3xl',
}: Props) {
  const router = useRouter();

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print();
  };

  return (
    <div
      className={`print:hidden bg-white border-b shadow-sm ${
        sticky ? 'sticky top-0 z-10' : ''
      }`}
    >
      <div
        className={`${maxWidthClass} mx-auto px-4 py-3 flex items-center justify-between gap-3`}
      >
        {backHref ? (
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-gray-600 text-sm hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> 戻る
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-gray-600 text-sm hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> 戻る
          </button>
        )}

        <div className="flex items-center gap-3">
          {note && <span className="text-xs text-gray-500">{note}</span>}
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow"
          >
            <Printer className="h-4 w-4" /> {printLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
