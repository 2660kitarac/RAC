import type { MetadataRoute } from 'next';

/**
 * ホーム画面に追加したときの設定（PWA マニフェスト）
 * 追加したアイコンから開くと、ブラウザのアドレスバーなしでアプリのように全画面表示される。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RAC Cloud',
    short_name: 'RAC Cloud',
    description: 'ローターアクトクラブ運営システム',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'ja',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
