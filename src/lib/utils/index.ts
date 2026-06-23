import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================
// 日付フォーマット
// ============================================================
export function formatDate(date: string | Date | null, formatStr = 'yyyy年M月d日'): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr, { locale: ja });
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy年M月d日 HH:mm', { locale: ja });
}

export function formatTime(time: string | null): string {
  if (!time) return '-';
  return time.substring(0, 5); // HH:MM
}

export function formatDateJa(date: string | null): string {
  if (!date) return '-';
  const d = parseISO(date);
  return format(d, 'M月d日(E)', { locale: ja });
}

// ============================================================
// 金額フォーマット
// ============================================================
export function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '¥0';
  return `¥${amount.toLocaleString('ja-JP')}`;
}

export function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '0';
  return amount.toLocaleString('ja-JP');
}

// ============================================================
// スラッグ生成
// ============================================================
export function generateSlug(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

// ============================================================
// 領収書番号生成
// ============================================================
export function generateReceiptNumber(date: Date, sequence: number): string {
  const dateStr = format(date, 'yyyyMMdd');
  const seq = sequence.toString().padStart(3, '0');
  return `RAC-${dateStr}-${seq}`;
}

// ============================================================
// 登録料計算
// ============================================================
export function calculateFee(
  memberType: string,
  meeting: { fee_rac: number; fee_rc: number; fee_obog: number; fee_guest: number },
  mealRequired: boolean,
  mealFee: number
): number {
  let baseFee = 0;
  switch (memberType) {
    case 'RAC':
      baseFee = meeting.fee_rac;
      break;
    case 'RC':
      baseFee = meeting.fee_rc;
      break;
    case 'OB_OG':
      baseFee = meeting.fee_obog;
      break;
    case 'GUEST':
      baseFee = meeting.fee_guest;
      break;
    default:
      baseFee = meeting.fee_guest;
  }
  return baseFee + (mealRequired ? mealFee : 0);
}

// ============================================================
// CSV出力ユーティリティ
// ============================================================
export function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      const str = String(value);
      // カンマや改行を含む場合はダブルクォートで囲む
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );

  // UTF-8 BOM付きCSV
  const bom = '\uFEFF';
  const csvContent = bom + [headers.join(','), ...rows].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${format(new Date(), 'yyyyMMdd')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// 出席率計算
// ============================================================
export function calculateAttendanceRate(presentCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  return Math.round((presentCount / totalCount) * 100);
}

// ============================================================
// 表彰点数計算
// ============================================================
export function calculateAttendanceRateScore(rate: number): number {
  if (rate === 100) return 10;
  if (rate >= 80) return 8;
  if (rate >= 60) return 6;
  return 0;
}

// ============================================================
// メールテンプレート変数置換
// ============================================================
export function replaceTemplateVariables(
  template: string, 
  variables: Record<string, string | number | null>
): string {
  let result = template;
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(
      new RegExp(`{{${key}}}`, 'g'), 
      value !== null && value !== undefined ? String(value) : ''
    );
  });
  return result;
}

// ============================================================
// ページネーション
// ============================================================
export function getPaginationRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
}

// ============================================================
// 年度計算
// ============================================================
export function getFiscalYear(date: Date = new Date()): number {
  // 7月始まりの年度
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return month >= 7 ? year : year - 1;
}

export function getFiscalYearLabel(year: number): string {
  return `${year}-${(year + 1).toString().substring(2)}年度`;
}

// ============================================================
// ID 生成（nanoid 簡易実装 - crypto.randomUUID 使用）
// ============================================================
export function nanoid(): string {
  // crypto.randomUUID は Edge Runtime / Node.js 両方で使用可能
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // フォールバック
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
