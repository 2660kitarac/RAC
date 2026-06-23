import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import ApprovalsContent from '@/components/approvals/ApprovalsContent';

export const metadata = { title: '会員承認管理' };

export default async function ApprovalsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if ((session.user as any).status === 'pending') redirect('/pending');

  const userRole = session.user.role || '';
  const allowedRoles = ['system_owner', 'district_admin', 'club_account', 'club_admin', 'president'];
  if (!allowedRoles.includes(userRole)) redirect('/dashboard');

  return (
    <ApprovalsContent
      userRole={userRole}
      clubId={(session.user as any).clubId || ''}
    />
  );
}
