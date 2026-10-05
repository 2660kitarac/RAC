/**
 * 報告書の審査（地区役員用）
 * クラブから提出された報告書（club_reports）を一覧・承認・差し戻しする
 */
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { clubReports, clubs, meetings, users } from '@/lib/db/schema';
import { requireDistrictPage } from '@/lib/district/context';
import { ReportReview, type ReviewReport } from '@/components/district/review/ReportReview';
import { NoDistrict } from '@/components/district/review/shared';

export const metadata = { title: '報告書の審査' };

export default async function DistrictReportsPage() {
  const { db, district } = await requireDistrictPage();

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">報告書の審査</h1>
        <p className="mt-1 text-sm text-gray-500">
          クラブから提出された報告書を確認して、「承認」または「差し戻し」をします。差し戻しの理由はクラブに表示されます。
        </p>
      </div>
      {district ? <Content db={db} districtId={district.id} /> : <NoDistrict />}
    </div>
  );
}

async function Content({ db, districtId }: { db: Awaited<ReturnType<typeof requireDistrictPage>>['db']; districtId: string }) {
  const [rows, clubRows] = await Promise.all([
    db
      .select({
        id: clubReports.id,
        clubId: clubReports.clubId,
        clubName: clubs.name,
        clubShortName: clubs.shortName,
        title: clubReports.title,
        reportType: clubReports.reportType,
        status: clubReports.status,
        content: clubReports.content,
        meetingTitle: meetings.title,
        meetingDate: meetings.date,
        meetingNumber: meetings.meetingNumber,
        submittedAt: clubReports.submittedAt,
        approvedAt: clubReports.approvedAt,
        rejectedAt: clubReports.rejectedAt,
        rejectionReason: clubReports.rejectionReason,
        submittedBy: clubReports.submittedBy,
        reviewedBy: clubReports.reviewedBy,
        updatedAt: clubReports.updatedAt,
      })
      .from(clubReports)
      .leftJoin(clubs, eq(clubReports.clubId, clubs.id))
      .leftJoin(meetings, eq(clubReports.meetingId, meetings.id))
      .where(and(
        eq(clubReports.districtId, districtId),
        isNull(clubReports.deletedAt),
        // 下書きはクラブ内だけのもの
        ne(clubReports.status, 'draft'),
      ))
      .orderBy(desc(clubReports.submittedAt), desc(clubReports.updatedAt)),
    db
      .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName })
      .from(clubs)
      .where(and(eq(clubs.districtId, districtId), isNull(clubs.deletedAt), eq(clubs.isSystemClub, false)))
      .orderBy(clubs.name),
  ]);

  // 提出者・審査者の名前
  const userIds = [...new Set(rows.flatMap((r) => [r.submittedBy, r.reviewedBy]).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const us = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds));
    us.forEach((u) => names.set(u.id, u.name));
  }

  const reports: ReviewReport[] = rows.map((r) => ({
    id: r.id,
    clubId: r.clubId,
    clubName: r.clubShortName || r.clubName || '（不明なクラブ）',
    title: r.title,
    reportType: r.reportType,
    status: r.status,
    content: r.content,
    meetingTitle: r.meetingTitle,
    meetingDate: r.meetingDate,
    meetingNumber: r.meetingNumber,
    submittedAt: r.submittedAt,
    approvedAt: r.approvedAt,
    rejectedAt: r.rejectedAt,
    rejectionReason: r.rejectionReason,
    submitterName: r.submittedBy ? names.get(r.submittedBy) ?? null : null,
    reviewerName: r.reviewedBy ? names.get(r.reviewedBy) ?? null : null,
    updatedAt: r.updatedAt,
  }));

  // 絞り込み用のクラブ一覧（地区外に移ったクラブの報告が残っていても選べるよう補う）
  const clubList = clubRows.map((c) => ({ id: c.id, name: c.shortName || c.name }));
  for (const r of reports) {
    if (!clubList.some((c) => c.id === r.clubId)) clubList.push({ id: r.clubId, name: r.clubName });
  }

  return <ReportReview reports={reports} clubs={clubList} />;
}
