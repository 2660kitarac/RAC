import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { canMutateClubRecord, canManageClub, isDistrictScope } from '@/lib/auth/tenant';

type RouteContext = { params: Promise<{ id: string }> };

/** clubId による多重防御条件（地区スタッフはクラブ横断可） */
function clubGuard(user: { role?: string | null; clubId?: string | null }) {
  if (isDistrictScope(user?.role)) return undefined;
  return user?.clubId ? eq(meetings.clubId, user.clubId) : undefined;
}

/** IDOR 対策: URL の id を信頼せず、レコードの clubId と突き合わせる */
async function assertOwned(
  db: any,
  id: string,
  user: { role?: string | null; clubId?: string | null },
) {
  const rows = await db
    .select({ id: meetings.id, clubId: meetings.clubId })
    .from(meetings)
    .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
    .limit(1);

  if (!rows.length) return NextResponse.json({ error: '例会が見つかりません' }, { status: 404 });
  if (!canMutateClubRecord(user, rows[0].clubId)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();

    const meeting = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, id))
      .then((r: any[]) => r[0]);

    if (!meeting) return NextResponse.json({ error: '見つかりません' }, { status: 404 });

    // 他クラブの例会情報（会費・会場・担当者など）を読ませない
    if (!canMutateClubRecord(session.user, meeting.clubId)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    return NextResponse.json({ meeting });
  } catch (e) {
    console.error('GET /api/meetings/[id] error:', e);
    return NextResponse.json({ error: '例会の取得に失敗しました' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!canManageClub(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getDbFromContext();

    const denied = await assertOwned(db, id, session.user);
    if (denied) return denied;

    const body = await request.json();

    const allowed = ['title','meetingNumber','theme','date','startTime','endTime',
      'venueName','venueAddress','committee','managerUserId','description',
      'programDetail','registrationDeadline','feeRac','feeRc','feeObog','feeGuest',
      'mealFee','muRegistrationSlug','muRegistrationUrl','status','isDistrictEvent',
      // 定員
      'capacity',
      // 懇親会
      'hasAfterParty','afterPartyVenue','afterPartyStartTime',
      'afterPartyFeeType','afterPartyFeeRac','afterPartyFeeRc','afterPartyFeeObog','afterPartyFeeGuest',
      'afterPartyAllowPartyOnly','afterPartyCapacity','ownClubFee'
    ];
    const updateData: any = { updatedAt: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updateData[key] = body[key];
    }

    await db.update(meetings)
      .set(updateData)
      .where(and(eq(meetings.id, id), clubGuard(session.user)));

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('PATCH /api/meetings/[id] error:', e);
    return NextResponse.json({ error: '例会の更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!canManageClub(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getDbFromContext();

    const denied = await assertOwned(db, id, session.user);
    if (denied) return denied;

    await db.update(meetings)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(meetings.id, id), clubGuard(session.user)));

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/meetings/[id] error:', e);
    return NextResponse.json({ error: '例会の削除に失敗しました' }, { status: 500 });
  }
}
