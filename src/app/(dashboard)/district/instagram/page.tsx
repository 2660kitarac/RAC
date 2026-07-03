import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, districts, instagramPosts, meetings } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { isDistrictStaff } from '@/lib/hooks/useAuth';

export const metadata = { title: 'Instagram投稿管理' };

export default async function DistrictInstagramPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const profile = await db
    .select({ id: users.id, role: users.role, clubId: users.clubId, districtId: users.districtId })
    .from(users)
    .where(and(eq(users.id, session.user.id!), isNull(users.deletedAt)))
    .then((r:any[])=>r[0]);

  if (!isDistrictStaff((profile?.role || 'system_owner') as any)) redirect('/dashboard');

  let effectiveDistrictId = profile?.districtId;
  if (!effectiveDistrictId && profile?.clubId) {
    const club = await db.select({ districtId: clubs.districtId }).from(clubs).where(eq(clubs.id, profile.clubId)).then((r:any[])=>r[0]);
    effectiveDistrictId = club?.districtId ?? undefined;
  }
  if (!effectiveDistrictId) {
    const first = await db.select({ id: districts.id }).from(districts).where(isNull(districts.deletedAt)).then((r:any[])=>r[0]);
    effectiveDistrictId = first?.id;
  }

  // instagram_posts を Drizzle ORM で取得（clubs・meetings と JOIN）
  let posts: any[] = [];
  if (effectiveDistrictId) {
    const rows = await db
      .select({
        id: instagramPosts.id,
        clubId: instagramPosts.clubId,
        meetingId: instagramPosts.meetingId,
        postType: instagramPosts.postType,
        postUrl: instagramPosts.postUrl,
        caption: instagramPosts.caption,
        status: instagramPosts.status,
        score: instagramPosts.score,
        createdAt: instagramPosts.createdAt,
        clubName: clubs.name,
        clubShortName: clubs.shortName,
        meetingTitle: meetings.title,
        meetingDate: meetings.date,
      })
      .from(instagramPosts)
      .leftJoin(clubs, eq(instagramPosts.clubId, clubs.id))
      .leftJoin(meetings, eq(instagramPosts.meetingId, meetings.id))
      .where(and(
        eq(instagramPosts.districtId, effectiveDistrictId),
        isNull(instagramPosts.deletedAt),
      ))
      .orderBy(desc(instagramPosts.createdAt))
      .catch(() => []);
    // テンプレート変数名に合わせてスネークケースに変換
    posts = rows.map((p: any) => ({
      ...p,
      club_name: p.clubName,
      club_short_name: p.clubShortName,
      meeting_title: p.meetingTitle,
      meeting_date: p.meetingDate,
      post_type: p.postType,
      post_url: p.postUrl,
    }));
  }

  const STATUS_LABELS: Record<string, string> = {
    pending: '未提出', submitted: '提出済', reviewing: '審査中',
    approved: '承認', rejected: '却下', not_applicable: '対象外'
  };
  const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600', submitted: 'bg-blue-100 text-blue-700',
    reviewing: 'bg-yellow-100 text-yellow-700', approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700', not_applicable: 'bg-gray-100 text-gray-400'
  };
  const POST_TYPE_LABELS: Record<string, string> = { before: '告知', after: '開催報告', other: 'その他' };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Instagram投稿管理</h1>
        <p className="text-sm text-gray-500 mt-1">クラブのInstagram投稿を審査・管理します</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {(['pending', 'submitted', 'approved'] as const).map(status => (
          <div key={status} className="bg-white border rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500">{STATUS_LABELS[status]}</p>
            <p className="text-2xl font-bold text-gray-800">
              {posts.filter((p: any) => p.status === status).length}
            </p>
          </div>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="bg-white border rounded-xl p-16 text-center text-gray-400">
          <p>Instagram投稿データがありません</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">クラブ</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">例会</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">種別</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">ステータス</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">スコア</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">投稿URL</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p: any) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{p.club_short_name ?? p.club_name ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-600 text-xs">{p.meeting_title ?? '—'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-xs bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded">
                        {POST_TYPE_LABELS[p.post_type] ?? p.post_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? ''}`}>
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{p.score ?? 0}</td>
                    <td className="py-3 px-4">
                      {p.post_url ? (
                        <a href={p.post_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs">
                          投稿を見る
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
