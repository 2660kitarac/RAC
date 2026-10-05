/**
 * Instagram 投稿の審査（地区役員用）
 * クラブから提出された投稿URL（instagram_posts）を承認・差し戻しし、スコアを付ける
 */
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { clubs, instagramPosts, meetings, users } from '@/lib/db/schema';
import { racYearRange, requireDistrictPage } from '@/lib/district/context';
import { InstagramReview, type ReviewPost } from '@/components/district/review/InstagramReview';
import { NoDistrict } from '@/components/district/review/shared';

export const metadata = { title: 'Instagram投稿の審査' };

export default async function DistrictInstagramPage() {
  const { db, district } = await requireDistrictPage();

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Instagram投稿の審査</h1>
        <p className="mt-1 text-sm text-gray-500">
          クラブから提出されたInstagram投稿を開いて確認し、「承認（スコアを付ける）」または「差し戻し」をします。
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
        id: instagramPosts.id,
        clubId: instagramPosts.clubId,
        clubName: clubs.name,
        clubShortName: clubs.shortName,
        postType: instagramPosts.postType,
        postUrl: instagramPosts.postUrl,
        caption: instagramPosts.caption,
        imageUrl: instagramPosts.imageUrl,
        status: instagramPosts.status,
        score: instagramPosts.score,
        rejectionReason: instagramPosts.rejectionReason,
        meetingTitle: meetings.title,
        meetingDate: meetings.date,
        meetingNumber: meetings.meetingNumber,
        submittedAt: instagramPosts.submittedAt,
        createdAt: instagramPosts.createdAt,
        reviewedAt: instagramPosts.reviewedAt,
        submittedBy: instagramPosts.submittedBy,
        reviewedBy: instagramPosts.reviewedBy,
      })
      .from(instagramPosts)
      .leftJoin(clubs, eq(instagramPosts.clubId, clubs.id))
      .leftJoin(meetings, eq(instagramPosts.meetingId, meetings.id))
      .where(and(eq(instagramPosts.districtId, districtId), isNull(instagramPosts.deletedAt)))
      .orderBy(desc(instagramPosts.submittedAt), desc(instagramPosts.createdAt)),
    db
      .select({ id: clubs.id, name: clubs.name, shortName: clubs.shortName })
      .from(clubs)
      .where(and(eq(clubs.districtId, districtId), isNull(clubs.deletedAt), eq(clubs.isSystemClub, false)))
      .orderBy(clubs.name),
  ]);

  const userIds = [...new Set(rows.flatMap((r) => [r.submittedBy, r.reviewedBy]).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const us = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds));
    us.forEach((u) => names.set(u.id, u.name));
  }

  const posts: ReviewPost[] = rows.map((r) => ({
    id: r.id,
    clubId: r.clubId,
    clubName: r.clubShortName || r.clubName || '（不明なクラブ）',
    postType: r.postType,
    postUrl: r.postUrl,
    caption: r.caption,
    imageUrl: r.imageUrl,
    status: r.status,
    score: r.score,
    rejectionReason: r.rejectionReason,
    meetingTitle: r.meetingTitle,
    meetingDate: r.meetingDate,
    meetingNumber: r.meetingNumber,
    submittedAt: r.submittedAt,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    submitterName: r.submittedBy ? names.get(r.submittedBy) ?? null : null,
    reviewerName: r.reviewedBy ? names.get(r.reviewedBy) ?? null : null,
  }));

  const clubList = clubRows.map((c) => ({ id: c.id, name: c.shortName || c.name }));
  for (const p of posts) {
    if (!clubList.some((c) => c.id === p.clubId)) clubList.push({ id: p.clubId, name: p.clubName });
  }

  return <InstagramReview posts={posts} clubs={clubList} year={racYearRange()} />;
}
