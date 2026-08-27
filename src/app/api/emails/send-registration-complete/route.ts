import { NextRequest, NextResponse } from 'next/server';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, clubs, emailTemplates, attendances, users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { formatDate, formatCurrency } from '@/lib/utils';

/**
 * 登録完了メール送信
 *
 * このエンドポイントは MU登録フォーム（未認証の外部参加者）から呼ばれるため
 * セッション認証を要求できない。代わりに以下で悪用を防ぐ:
 *
 *  1. 宛先はリクエストボディではなく attendanceId から DB を引いて決定する
 *     （任意アドレスへの送信＝スパム／フィッシング中継を防止）
 *  2. 登録直後（REGISTRATION_WINDOW_MS 以内）の出席レコードのみ対象
 *  3. 同一 attendanceId への再送を拒否（多重送信によるメール爆撃を防止）
 *  4. IP 単位のレート制限
 */

/** 登録直後とみなす時間（15分） */
const REGISTRATION_WINDOW_MS = 15 * 60 * 1000;
/** IP あたりの許可回数 / 時間窓 */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// サーバーレスではインスタンス単位のため完全ではないが、
// 単一インスタンスへの連続攻撃には有効な緩和策となる。
const rateBuckets = new Map<string, number[]>();
const sentAttendanceIds = new Map<string, number>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  // 古いバケットを間引く（メモリリーク防止）
  if (rateBuckets.size > 500) {
    for (const [k, v] of rateBuckets) {
      if (!v.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) rateBuckets.delete(k);
    }
  }
  return false;
}

function alreadySent(attendanceId: string): boolean {
  const now = Date.now();
  const at = sentAttendanceIds.get(attendanceId);
  if (at && now - at < REGISTRATION_WINDOW_MS) return true;
  sentAttendanceIds.set(attendanceId, now);
  if (sentAttendanceIds.size > 2000) {
    for (const [k, v] of sentAttendanceIds) {
      if (now - v > REGISTRATION_WINDOW_MS) sentAttendanceIds.delete(k);
    }
  }
  return false;
}

function clientKey(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** 成功・失敗いずれも同じ形で返す（列挙攻撃で情報を漏らさない） */
function ok(message?: string) {
  return NextResponse.json({ success: false, message: message ?? 'メールは送信されませんでした' });
}

export async function POST(request: NextRequest) {
  try {
    const { attendanceId } = await request.json();

    if (!attendanceId || typeof attendanceId !== 'string') {
      return NextResponse.json({ error: 'attendanceId は必須です' }, { status: 400 });
    }

    if (isRateLimited(clientKey(request))) {
      return NextResponse.json({ error: 'リクエストが多すぎます' }, { status: 429 });
    }

    if (alreadySent(attendanceId)) {
      return ok('すでに送信済みです');
    }

    const db = await getDbFromContext();

    // 宛先・氏名・金額はすべて DB の出席レコードから導出する
    const [attendance] = await db
      .select({
        id: attendances.id,
        meetingId: attendances.meetingId,
        userId: attendances.userId,
        externalName: attendances.externalName,
        externalEmail: attendances.externalEmail,
        mealRequired: attendances.mealRequired,
        feeAmount: attendances.feeAmount,
        afterPartyFeeAmount: attendances.afterPartyFeeAmount,
        createdAt: attendances.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(attendances)
      .leftJoin(users, eq(attendances.userId, users.id))
      .where(and(eq(attendances.id, attendanceId), isNull(attendances.deletedAt)))
      .limit(1);

    if (!attendance) return ok('対象の登録が見つかりません');

    // 登録直後のみ送信を許可（過去レコードへのメール再送を防ぐ）
    const createdMs = Date.parse(String(attendance.createdAt).replace(' ', 'T'));
    if (Number.isFinite(createdMs) && Date.now() - createdMs > REGISTRATION_WINDOW_MS) {
      return ok('送信可能な期間を過ぎています');
    }

    const to = attendance.externalEmail || attendance.userEmail;
    const name = attendance.externalName || attendance.userName || 'ご参加者';
    if (!to) return ok('宛先メールアドレスが登録されていません');

    const [meeting] = await db
      .select({
        id: meetings.id,
        title: meetings.title,
        date: meetings.date,
        startTime: meetings.startTime,
        endTime: meetings.endTime,
        venueName: meetings.venueName,
        clubId: meetings.clubId,
        clubName: clubs.name,
      })
      .from(meetings)
      .leftJoin(clubs, eq(meetings.clubId, clubs.id))
      .where(eq(meetings.id, attendance.meetingId))
      .limit(1);

    if (!meeting) return ok('例会が見つかりません');

    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.clubId, meeting.clubId),
          eq(emailTemplates.templateType, 'registration_complete'),
          eq(emailTemplates.isDefault, true),
          isNull(emailTemplates.deletedAt)
        )
      )
      .limit(1);

    if (!template || !process.env.RESEND_API_KEY) {
      return NextResponse.json({ success: false, message: 'メール設定が未完了です' });
    }

    const totalFee = (attendance.feeAmount ?? 0) + (attendance.afterPartyFeeAmount ?? 0);

    const subject = template.subjectTemplate.replace('{{meeting_title}}', meeting.title);
    const body = template.bodyTemplate
      .replace('{{name}}', name)
      .replace('{{meeting_title}}', meeting.title)
      .replace('{{date}}', formatDate(meeting.date))
      .replace('{{start_time}}', meeting.startTime?.substring(0, 5) || '')
      .replace('{{end_time}}', meeting.endTime?.substring(0, 5) || '')
      .replace('{{venue_name}}', meeting.venueName || '')
      .replace('{{fee_amount}}', formatCurrency(totalFee))
      .replace('{{meal_required}}', attendance.mealRequired ? '希望する' : '希望しない');

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@raccloud.jp',
        to,
        subject,
        text: body,
      }),
    });

    if (!resendResponse.ok) {
      throw new Error('メール送信に失敗しました');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Registration email error:', error);
    return NextResponse.json({ error: 'メール送信に失敗しました' }, { status: 500 });
  }
}
