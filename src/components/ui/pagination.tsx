'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  className?: string;
}

export function Pagination({ page, totalPages, totalCount, pageSize, className }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`${pathname}?${params.toString()}`);
  };

  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  // 表示するページ番号の計算（前後2ページ）
  const pageNumbers: (number | '...')[] = [];
  const delta = 2;
  const range: number[] = [];
  for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) {
    range.push(i);
  }
  if (page - delta > 2) pageNumbers.push(1, '...');
  else pageNumbers.push(1);
  pageNumbers.push(...range);
  if (page + delta < totalPages - 1) pageNumbers.push('...', totalPages);
  else if (totalPages > 1) pageNumbers.push(totalPages);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 px-2 py-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <p className="text-center text-xs text-gray-500 sm:text-left sm:text-sm">
        {totalCount}件中 {start}〜{end}件を表示
      </p>
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={() => goToPage(1)}
          disabled={page === 1}
          className="hidden sm:inline-flex p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title="最初のページ"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page === 1}
          className="inline-flex h-10 w-10 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed sm:h-8 sm:w-8"
          title="前のページ"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageNumbers.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="hidden px-2 text-gray-400 text-sm sm:inline">…</span>
          ) : (
            <button
              key={p}
              onClick={() => goToPage(p as number)}
              className={cn(
                'h-10 w-10 rounded text-sm font-medium sm:h-8 sm:w-8',
                page === p
                  ? 'bg-blue-600 text-white'
                  : 'hidden text-gray-700 hover:bg-gray-100 sm:inline-block'
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => goToPage(page + 1)}
          disabled={page === totalPages}
          className="inline-flex h-10 w-10 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed sm:h-8 sm:w-8"
          title="次のページ"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(totalPages)}
          disabled={page === totalPages}
          className="hidden sm:inline-flex p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title="最後のページ"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
