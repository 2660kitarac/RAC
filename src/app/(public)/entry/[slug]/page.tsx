import type { Metadata } from 'next';
import { PublicEntryNew } from '@/components/district-registration/PublicEntryPage';

// 地区行事の申込ページ（ログイン不要）。データは画面側で公開APIから読み込む。
export const metadata: Metadata = {
  title: '行事申込',
  robots: { index: false, follow: false },
};

export default async function EntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicEntryNew slug={slug} />;
}
