import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    const { id } = await params;
    const db = await getDbFromContext();
    const meeting = await db.select().from(meetings).where(eq(meetings.id, id)).get();
    if (!meeting) return NextResponse.json({ error: '見つかりません' }, { status: 404 });
    return NextResponse.json({ meeting });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    const { id } = await params;
    const db = await getDbFromContext();
    const body = await request.json();

    const allowed = ['title','meetingNumber','theme','date','startTime','endTime',
      'venueName','venueAddress','committee','managerUserId','description',
      'programDetail','registrationDeadline','feeRac','feeRc','feeObog','feeGuest',
      'mealFee','muRegistrationSlug','status','isDistrictEvent'];
    const updateData: any = { updatedAt: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updateData[key] = body[key];
    }

    await db.update(meetings).set(updateData).where(eq(meetings.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    const { id } = await params;
    const db = await getDbFromContext();
    await db.update(meetings).set({ deletedAt: new Date().toISOString() }).where(eq(meetings.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
