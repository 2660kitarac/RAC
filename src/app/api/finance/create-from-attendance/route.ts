import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { attendances, transactions, meetings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { attendanceId } = await request.json();
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();

    const [attendance] = await db
      .select()
      .from(attendances)
      .where(eq(attendances.id, attendanceId))
      .limit(1);

    if (!attendance || attendance.feeAmount === 0) {
      return NextResponse.json({ success: false, message: '対象なし' });
    }

    const [meeting] = await db
      .select({ clubId: meetings.clubId, title: meetings.title })
      .from(meetings)
      .where(eq(meetings.id, attendance.meetingId))
      .limit(1);

    if (!meeting) return NextResponse.json({ success: false, message: '例会が見つかりません' });

    // 重複チェック（raw SQLで）
    const { env } = (await import('@opennextjs/cloudflare')).getCloudflareContext();
    const existing = await env.DB.prepare(
      `SELECT id FROM transactions WHERE club_id=? AND meeting_id=? AND description LIKE ? AND deleted_at IS NULL LIMIT 1`
    ).bind(meeting.clubId, attendance.meetingId, `%${attendanceId}%`).first();

    if (existing) {
      return NextResponse.json({ success: false, message: '既に取引が作成されています' });
    }

    const txId = randomUUID();
    await db.insert(transactions).values({
      id: txId,
      clubId: meeting.clubId,
      meetingId: attendance.meetingId,
      type: 'income',
      amount: attendance.feeAmount,
      description: `例会参加費 [${attendanceId}]`,
      transactionDate: new Date().toISOString().split('T')[0],
      category: 'meeting_fee',
    } as any);

    return NextResponse.json({ success: true, transactionId: txId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
