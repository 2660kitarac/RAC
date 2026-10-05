import type { Metadata } from 'next';
import { PublicEntryEdit } from '@/components/district-registration/PublicEntryPage';

// 申込内容の確認・修正ページ（修正用リンク／ログイン不要）
export const metadata: Metadata = {
  title: 'お申込み内容の確認・修正',
  robots: { index: false, follow: false },
  // 修正用リンク（トークン）を外部サイトへ送らない
  referrer: 'no-referrer',
};

export default async function EntryEditPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  return <PublicEntryEdit slug={slug} token={token} />;
}
