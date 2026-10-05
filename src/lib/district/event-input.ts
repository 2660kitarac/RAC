/**
 * 地区行事の入力チェック（POST /api/district と PATCH /api/district/[id] で共通）
 */
import { and, eq, isNull } from 'drizzle-orm';
import { clubs } from '@/lib/db/schema';
import type { Db } from '@/lib/district/context';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const dateOrNull = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const timeOrNull = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null);

export async function parseEventInput(db: Db, districtId: string, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = str(b.title, 120);
  const date = dateOrNull(b.date);
  if (!title || !date) return { error: '行事名・開催日は必須です' } as const;

  // 主催クラブは同じ地区のクラブに限る
  let hostClubId: string | null = null;
  if (typeof b.hostClubId === 'string' && b.hostClubId) {
    const [c] = await db
      .select({ id: clubs.id })
      .from(clubs)
      .where(and(eq(clubs.id, b.hostClubId.slice(0, 64)), eq(clubs.districtId, districtId), isNull(clubs.deletedAt)))
      .limit(1);
    hostClubId = c?.id ?? null;
  }
  const fee = Math.max(0, Math.min(10_000_000, Math.floor(Number(b.registrationFee) || 0)));

  return {
    values: {
      title,
      eventType: str(b.eventType, 40) || 'その他',
      date,
      startTime: timeOrNull(b.startTime),
      endTime: timeOrNull(b.endTime),
      venueName: str(b.venueName, 200) || null,
      venueAddress: str(b.venueAddress, 300) || null,
      registrationFee: fee,
      registrationDeadline: dateOrNull(b.registrationDeadline),
      description: str(b.description, 5000) || null,
      hostClubId,
      isAwardTarget: b.isAwardTarget === true,
      isJointMeeting: b.isJointMeeting === true,
    },
  } as const;
}
