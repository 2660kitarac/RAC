import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances, users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// GET /api/attendances?meetingId=xxx&clubId=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    const meetingId = url.searchParams.get('meetingId');
    const clubId = url.searchParams.get('clubId') || session.user.clubId;

    const conditions = and(
      meetingId ? eq(attendances.meetingId, meetingId) : undefined,
      isNull(attendances.deletedAt),
    );

    const results = await db
      .select({
        id: attendances.id,
        meetingId: attendances.meetingId,
        userId: attendances.userId,
        externalName: attendances.externalName,
        externalEmail: attendances.externalEmail,
        externalPhone: attendances.externalPhone,
        clubId: attendances.clubId,
        clubName: attendances.clubName,
        memberType: attendances.memberType,
        attendanceStatus: attendances.attendanceStatus,
        registrationType: attendances.registrationType,
        mealRequired: attendances.mealRequired,
        feeAmount: attendances.feeAmount,
        paymentStatus: attendances.paymentStatus,
        paymentMethod: attendances.paymentMethod,
        paidAt: attendances.paidAt,
        receiptRequired: attendances.receiptRequired,
        receiptNameType: attendances.receiptNameType,
        receiptName: attendances.receiptName,
        note: attendances.note,
        registeredAt: attendances.registeredAt,
        createdAt: attendances.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(attendances)
      .leftJoin(users, eq(attendances.userId, users.id))
      .where(conditions);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/attendances error:', error);
    return NextResponse.json({ error: '出席情報の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/attendances - 出席登録
// MU登録（外部フォーム）からの呼び出しは未認証でも許可
export async function POST(request: NextRequest) {
  try {
    // registrationType が 'mu' の場合は未認証でも許可（外部参加者登録）
    const body = await request.json();
    const isMuRegistration = body.registrationType === 'mu';

    if (!isMuRegistration) {
      const session = await auth();
      if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const db = await getDbFromContext();
    const {
      meetingId, userId, externalName, externalEmail, externalPhone,
      clubId, clubName, memberType, attendanceStatus, registrationType,
      mealRequired, feeAmount, paymentStatus, paymentMethod,
      receiptRequired, receiptNameType, receiptName, note,
      participationType, afterPartyFeeAmount,
    } = body;

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId は必須です' }, { status: 400 });
    }

    // MU登録は外部名前+メールが必須
    if (isMuRegistration && !externalName && !userId) {
      return NextResponse.json({ error: 'お名前は必須です' }, { status: 400 });
    }

    const id = randomUUID();
    await db.insert(attendances).values({
      id,
      meetingId,
      userId: userId || null,
      externalName: externalName || null,
      externalEmail: externalEmail || null,
      externalPhone: externalPhone || null,
      clubId: clubId || null,
      clubName: clubName || null,
      memberType: memberType || 'RAC',
      attendanceStatus: attendanceStatus || 'undecided',
      registrationType: registrationType || 'member',
      mealRequired: mealRequired ?? false,
      feeAmount: feeAmount ?? 0,
      paymentStatus: paymentStatus || 'unpaid',
      paymentMethod: paymentMethod || null,
      receiptRequired: receiptRequired ?? false,
      receiptNameType: receiptNameType || null,
      receiptName: receiptName || null,
      note: note || null,
      participationType: participationType || 'meeting_only',
      afterPartyFeeAmount: afterPartyFeeAmount ?? 0,
    } as any);

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/attendances error:', error);
    return NextResponse.json({ error: '出席登録に失敗しました' }, { status: 500 });
  }
}
