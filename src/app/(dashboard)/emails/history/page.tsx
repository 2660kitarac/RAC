import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { emails, meetings } from '@/lib/db/schema';
import { eq, and, isNull, count, desc } from 'drizzle-orm';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { formatDateTime } from '@/lib/utils';

export const metadata = { title: 'メール送信履歴' };

const PAGE_SIZE = 30;

export default async function EmailHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const clubId = session.user.clubId;

  const emailWhere = clubId
    ? and(eq(emails.clubId, clubId), isNull(emails.deletedAt))
    : isNull(emails.deletedAt);

  const [countResult, emailsResult] = await Promise.all([
    db.select({ value: count() }).from(emails).where(emailWhere),

    db.select({
      id: emails.id,
      subject: emails.subject,
      status: emails.status,
      sentAt: emails.sentAt,
      targetType: emails.targetType,
      meetingId: emails.meetingId,
    })
      .from(emails)
      .where(emailWhere)
      .orderBy(desc(emails.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  // 例会タイトルを取得
  const meetingIdList = [...new Set(emailsResult.map(e => e.meetingId).filter(Boolean))] as string[];
  const meetingMap: Record<string, string> = {};
  if (meetingIdList.length > 0) {
    const { inArray } = await import('drizzle-orm');
    const rows = await db.select({ id: meetings.id, title: meetings.title })
      .from(meetings)
      .where(inArray(meetings.id, meetingIdList));
    rows.forEach(m => { meetingMap[m.id] = m.title; });
  }

  const emailsCount = countResult[0]?.value || 0;
  const totalPages = Math.ceil(emailsCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">メール送信履歴</h1>
        <p className="text-sm text-gray-500">{emailsCount}件</p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">件名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">例会</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">送信先</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">送信日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {emailsResult.map(email => (
                <tr key={email.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{email.subject}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {email.meetingId ? meetingMap[email.meetingId] || '-' : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{email.targetType || '-'}</td>
                  <td className="px-4 py-3">
                    <Badge className={
                      email.status === 'sent' ? 'bg-green-100 text-green-700' :
                      email.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }>
                      {email.status === 'sent' ? '送信済' : email.status === 'failed' ? '失敗' : '下書き'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {email.sentAt ? formatDateTime(email.sentAt) : '-'}
                  </td>
                </tr>
              ))}
              {emailsResult.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">送信履歴がありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          totalCount={emailsCount}
          pageSize={PAGE_SIZE}
          className="border-t px-4"
        />
      </Card>
    </div>
  );
}
