import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, emailTemplates } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import EmailTemplatesManager from '@/components/emails/EmailTemplatesManager';

export const metadata = { title: 'メールテンプレート管理' };

export default async function EmailTemplatesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();
  const clubId = session.user.clubId;
  const role = (session.user as any).role || 'member';

  const allTemplates = await db
    .select()
    .from(emailTemplates)
    .where(isNull(emailTemplates.deletedAt));

  const templates = clubId
    ? allTemplates.filter(t => t.clubId === clubId || t.clubId === null)
    : allTemplates;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">メールテンプレート管理</h1>
        <p className="text-sm text-gray-500 mt-1">例会案内・登録完了などのメールテンプレートを管理します</p>
      </div>
      <EmailTemplatesManager
        templates={templates as any}
        clubId={clubId || ''}
        userRole={role}
      />
    </div>
  );
}
