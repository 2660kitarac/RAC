import { NextRequest, NextResponse } from 'next/server';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, clubs, emailTemplates } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { formatDate, formatCurrency } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const { meetingId, name, email, feeAmount, mealRequired } = await request.json();

    const db = await getDbFromContext();

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
      .where(eq(meetings.id, meetingId))
      .limit(1);

    if (!meeting) {
      return NextResponse.json({ error: '例会が見つかりません' }, { status: 404 });
    }

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

    const subject = template.subjectTemplate.replace('{{meeting_title}}', meeting.title);
    const body = template.bodyTemplate
      .replace('{{name}}', name)
      .replace('{{meeting_title}}', meeting.title)
      .replace('{{date}}', formatDate(meeting.date))
      .replace('{{start_time}}', meeting.startTime?.substring(0, 5) || '')
      .replace('{{end_time}}', meeting.endTime?.substring(0, 5) || '')
      .replace('{{venue_name}}', meeting.venueName || '')
      .replace('{{fee_amount}}', formatCurrency(feeAmount))
      .replace('{{meal_required}}', mealRequired ? '希望する' : '希望しない');

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@raccloud.jp',
        to: email,
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
