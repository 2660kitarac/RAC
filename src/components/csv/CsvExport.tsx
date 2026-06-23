'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface CsvExportProps {
  clubId: string;
  clubName: string;
}

type ExportType = 
  | 'meetings' | 'attendances' | 'members' | 'clubs' 
  | 'transactions' | 'annual_fees' | 'receipts' | 'emails';

const EXPORT_ITEMS: { type: ExportType; label: string; description: string }[] = [
  { type: 'meetings', label: '例会一覧CSV', description: '全例会の一覧をCSV出力します' },
  { type: 'attendances', label: '出席者一覧CSV', description: '全例会の出席者をCSV出力します' },
  { type: 'members', label: '会員一覧CSV', description: 'クラブ会員の一覧をCSV出力します' },
  { type: 'clubs', label: 'クラブ一覧CSV', description: '登録クラブの一覧をCSV出力します' },
  { type: 'transactions', label: '収支一覧CSV', description: '収支データをCSV出力します' },
  { type: 'annual_fees', label: '年会費一覧CSV', description: '年会費の支払状況をCSV出力します' },
  { type: 'receipts', label: '領収書一覧CSV', description: '発行済み領収書をCSV出力します' },
  { type: 'emails', label: 'メール送信履歴CSV', description: 'メール送信履歴をCSV出力します' },
];

export default function CsvExport({ clubId, clubName }: CsvExportProps) {
  const [downloading, setDownloading] = useState<ExportType | null>(null);

  const handleExport = async (type: ExportType) => {
    setDownloading(type);
    try {
      const response = await fetch(`/api/csv/export?type=${type}&clubId=${clubId}`);
      if (!response.ok) throw new Error('CSV出力に失敗しました');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${EXPORT_ITEMS.find(i => i.type === type)?.label}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV出力が完了しました');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'CSV出力に失敗しました');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">CSV出力</h1>
        <p className="text-gray-500 text-sm mt-1">{clubName} のデータをCSV形式でダウンロードできます</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXPORT_ITEMS.map(item => (
          <Card key={item.type} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={downloading === item.type}
                onClick={() => handleExport(item.type)}
              >
                <Download className="h-4 w-4" />
                出力
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <p className="text-sm text-blue-700">
            ℹ️ CSVファイルはUTF-8 BOM付きで出力されます。Excelで開く際に文字化けしません。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
