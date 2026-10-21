import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CsvExport from '@/components/csv/CsvExport';
import { canAccessPage } from '@/lib/auth/page-access';

export const metadata = { title: 'CSV出力' };

export default async function CsvPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  // ロールで開けるページを制限（#48）
  if (!canAccessPage(session.user.role, '/csv')) redirect('/dashboard');

  const clubId = session.user.clubId || '';
  const clubName = (session.user as any).clubName || '';

  return <CsvExport clubId={clubId} clubName={clubName} />;
}
