import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs, districts } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { isDistrictStaff } from '@/lib/hooks/useAuth';
import { formatDate } from '@/lib/utils';

export const metadata = { title: '地区報告書管理' };

export default async function DistrictReportsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = await getDbFromContext();

  const profile = await db
    .select({ id: users.id, role: users.role, clubId: users.clubId, districtId: users.districtId })
    .from(users)
    .where(and(eq(users.id, session.user.id!), isNull(users.deletedAt)))
    .get();

  if (!isDistrictStaff((profile?.role || 'system_owner') as any)) redirect('/dashboard');

  let effectiveDistrictId = profile?.districtId;
  if (!effectiveDistrictId && profile?.clubId) {
    const club = await db.select({ districtId: clubs.districtId }).from(clubs).where(eq(clubs.id, profile.clubId)).get();
    effectiveDistrictId = club?.districtId ?? undefined;
  }
  if (!effectiveDistrictId) {
    const first = await db.select({ id: districts.id }).from(districts).where(isNull(districts.deletedAt)).get();
    effectiveDistrictId = first?.id;
  }

  // club_reports は D1 未定義テーブル（将来実装）→ D1 raw SQL で取得
  // TODO: スキーマ定義後に Drizzle クエリへ置き換える
  let reports: any[] = [];
  if (effectiveDistrictId && d1) {
    const result = await d1
      .prepare(`
        SELECT cr.*, c.name as club_name, c.short_name as club_short_name
        FROM club_reports cr
        LEFT JOIN clubs c ON cr.club_id = c.id
        WHERE cr.district_id=? AND cr.deleted_at IS NULL
        ORDER BY cr.created_at DESC
      `)
      .bind(effectiveDistrictId)
      .all()
      .catch(() => ({ results: [] }));
    reports = (result as any).results ?? [];
  }

  const STATUS_LABELS: Record<string, string> = {
    draft: '下書き', submitted: '提出済', approved: '承認済', rejected: '却下'
  };
  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600', submitted: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700'
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">地区報告書管理</h1>
        <p className="text-sm text-gray-500 mt-1">クラブからの報告書を管理・審査します</p>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white border rounded-xl p-16 text-center text-gray-400">
          <p>提出された報告書がありません</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">クラブ名</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">タイトル</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">種別</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">ステータス</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">締切</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">提出日</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{r.club_short_name ?? r.club_name ?? '—'}</td>
                    <td className="py-3 px-4">{r.title}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{r.report_type}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? ''}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">{r.deadline ? formatDate(r.deadline) : '—'}</td>
                    <td className="py-3 px-4 text-xs text-gray-500">{r.submitted_at ? formatDate(r.submitted_at) : '—'}</td>
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
