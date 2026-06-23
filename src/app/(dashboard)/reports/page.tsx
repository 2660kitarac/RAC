import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, meetingReports, meetings } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

export const metadata = { title: '例会報告書一覧' };

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();

  const clubId = session.user.clubId;

  const reports = await db
    .select({
      id: meetingReports.id,
      meetingId: meetingReports.meetingId,
      status: meetingReports.status,
      createdAt: meetingReports.createdAt,
      meetingTitle: meetings.title,
      meetingDate: meetings.date,
      meetingNumber: meetings.meetingNumber,
    })
    .from(meetingReports)
    .leftJoin(meetings, eq(meetingReports.meetingId, meetings.id))
    .where(
      and(
        clubId ? eq(meetingReports.clubId, clubId) : undefined,
        isNull(meetingReports.deletedAt)
      )
    )
    .orderBy(desc(meetingReports.createdAt));

  const STATUS_LABELS: Record<string, string> = {
    draft: '下書き',
    submitted: '提出済',
    approved: '承認済',
  };
  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    submitted: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">例会報告書一覧</h1>
        <p className="text-sm text-gray-500 mt-1">作成済みの例会報告書を管理します</p>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white border rounded-xl p-16 text-center">
          <div className="text-gray-300 text-5xl mb-4">📝</div>
          <p className="text-gray-500 mb-4">報告書がまだ作成されていません</p>
          <p className="text-sm text-gray-400">
            例会の詳細画面から「報告書」タブで作成できます
          </p>
          <Link href="/meetings"
            className="inline-flex mt-4 items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            例会一覧へ
          </Link>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">例会名</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">開催日</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">ステータス</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">作成日</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-medium">{r.meetingTitle ?? '—'}</div>
                      {r.meetingNumber && (
                        <div className="text-xs text-gray-400">第{r.meetingNumber}回</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {r.meetingDate ? formatDate(r.meetingDate) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status ?? 'draft']}`}>
                        {STATUS_LABELS[r.status ?? 'draft']}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{formatDate(r.createdAt)}</td>
                    <td className="py-3 px-4 text-center">
                      <Link href={`/meetings/${r.meetingId}/report`}
                        className="inline-flex items-center px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                        編集
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden divide-y">
            {reports.map(r => (
              <div key={r.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{r.meetingTitle ?? '—'}</p>
                    <p className="text-xs text-gray-400">
                      {r.meetingDate ? formatDate(r.meetingDate) : ''}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status ?? 'draft']}`}>
                    {STATUS_LABELS[r.status ?? 'draft']}
                  </span>
                </div>
                <Link href={`/meetings/${r.meetingId}/report`}
                  className="block w-full text-center py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">
                  報告書を開く
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
