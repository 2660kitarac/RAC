'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mail } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl">R</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">RAC Cloud</h1>
          <p className="text-gray-500 mt-1">パスワード再設定</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              パスワードをお忘れの方へ
            </CardTitle>
            <CardDescription>
              パスワードの再設定はシステム管理者が行います。
              クラブの担当者または管理者にお問い合わせください。
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 space-y-2">
              <p className="font-medium">お問い合わせ方法</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>クラブの事務局担当者に連絡する</li>
                <li>管理者アカウントから「ユーザー管理」でパスワードを再設定してもらう</li>
              </ul>
            </div>
          </CardContent>

          <CardFooter>
            <Link href="/login" className="w-full">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                ログインに戻る
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
