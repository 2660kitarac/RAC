import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { emails, emailRecipients, users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// GET /api/emails/history?clubId=xxx&status=sent&meetingId=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const url = new URL(request.url);
    const clubId = url.searchParams.get('clubId') || session.user.clubId;
    const status = url.searchParams.get('status');
    const meetingId = url.searchParams.get('meetingId');

    const conditions = and(
      isNull(emails.deletedAt),
      clubId ? eq(emails.clubId, clubId) : undefined,
      status ? eq(emails.status, status) : undefined,
      meetingId ? eq(emails.meetingId, meetingId) : undefined,
    );

    const emailList = await db.select({
      id: emails.id,
      clubId: emails.clubId,
      meetingId: emails.meetingId,
      templateId: emails.templateId,
      subject: emails.subject,
      body: emails.body,
      targetType: emails.targetType,
      ccEmails: emails.ccEmails,
      bccEmails: emails.bccEmails,
      replyTo: emails.replyTo,
      status: emails.status,
      sentAt: emails.sentAt,
      createdBy: emails.createdBy,
      createdAt: emails.createdAt,
      updatedAt: emails.updatedAt,
    }).from(emails).where(conditions).orderBy(emails.createdAt);

    return NextResponse.json(emailList);
  } catch (error) {
    console.error('GET /api/emails/history error:', error);
    return NextResponse.json({ error: 'メール履歴の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/emails/history - 下書き保存（送信はしない）
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const body = await request.json();
    const {
      clubId, meetingId, templateId, subject, bodyContent,
      targetType, ccEmails, bccEmails, replyTo,
    } = body;

    if (!subject) {
      return NextResponse.json({ error: 'subject は必須です' }, { status: 400 });
    }

    const resolvedClubId = clubId || session.user.clubId;

    const id = randomUUID();
    await db.insert(emails).values({
      id,
      clubId: resolvedClubId || null,
      meetingId: meetingId || null,
      templateId: templateId || null,
      subject,
      body: bodyContent || '',
      targetType: targetType || null,
      ccEmails: ccEmails ? JSON.stringify(ccEmails) : null,
      bccEmails: bccEmails ? JSON.stringify(bccEmails) : null,
      replyTo: replyTo || null,
      status: 'draft',
      createdBy: session.user.id,
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/emails/history error:', error);
    return NextResponse.json({ error: 'メールの保存に失敗しました' }, { status: 500 });
  }
}
