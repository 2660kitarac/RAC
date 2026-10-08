import type { Metadata, Viewport } from 'next';
import { Noto_Sans_JP } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'RAC Cloud - ローターアクトクラブ運営システム',
    template: '%s | RAC Cloud',
  },
  description: 'ローターアクトクラブの例会管理、出席管理、会計管理を一元化するSaaSシステム',
  keywords: ['ローターアクト', 'RAC', 'クラブ管理', '例会管理'],
  // iPhone で「ホーム画面に追加」したときの名前・表示（アイコンは app/apple-icon.png）
  applicationName: 'RAC Cloud',
  appleWebApp: {
    capable: true,
    title: 'RAC Cloud',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // iPhone の切り欠き・ホームバー部分まで使い、各画面の余白（safe-area）で調整する
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={notoSansJP.className}>
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            duration: 4000,
          }}
        />
      </body>
    </html>
  );
}
