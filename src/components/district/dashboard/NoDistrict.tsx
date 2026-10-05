/**
 * 担当地区が設定されていないときの案内
 */
import { MapPinOff } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function NoDistrict({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <Card className="mt-6 flex flex-col items-center gap-3 p-8 text-center">
        <MapPinOff className="h-10 w-10 text-gray-300" />
        <p className="font-medium text-gray-800">地区が設定されていません</p>
        <p className="text-sm text-gray-500">
          あなたのアカウントに担当地区が登録されていないため、表示できる情報がありません。
          <br className="hidden sm:inline" />
          システム管理者に「担当地区の設定」を依頼してください。
        </p>
      </Card>
    </div>
  );
}
