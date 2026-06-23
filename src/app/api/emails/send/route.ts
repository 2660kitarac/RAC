import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { emails, emailRecipients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// POST /api/emails/send - メール手動送信
// body: {
//   clubId, meetingId?, templateId?, subject, body,
//   targetType?, recipients: [{userId?, name, email}],
//   ccEmails?: string[], bccEmails?: string[], replyTo?: string,
//   emailId?: string  // 既存下書きのIDを指定した場合はそれを更新
// }
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const {
      clubId, meetingId, templateId, subject, body: bodyContent,
      targetType, recipients, ccEmails, bccEmails, replyTo, emailId: existingEmailId,
    } = await request.json();

    if (!subject || !bodyContent) {
      return NextResponse.json({ error: 'subject と body は必須です' }, { status: 400 });
    }
    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: '送信先を1件以上指定してください' }, { status: 400 });
    }

    const resolvedClubId = clubId || session.user.clubId;
    const ccJson = ccEmails?.length ? JSON.stringify(ccEmails) : null;
    const bccJson = bccEmails?.length ? JSON.stringify(bccEmails) : null;

    // メールレコードを作成 or 更新
    let emailId = existingEmailId;
    if (emailId) {
      await db.update(emails).set({
        subject, body: bodyContent, targetType: targetType || null,
        ccEmails: ccJson, bccEmails: bccJson, replyTo: replyTo || null,
        updatedAt: new Date().toISOString(),
      }).where(eq(emails.id, emailId));
    } else {
      emailId = randomUUID();
      await db.insert(emails).values({
        id: emailId,
        clubId: resolvedClubId || null,
        meetingId: meetingId || null,
        templateId: templateId || null,
        subject,
        body: bodyContent,
        targetType: targetType || null,
        ccEmails: ccJson,
        bccEmails: bccJson,
        replyTo: replyTo || null,
        status: 'sending',
        createdBy: session.user.id,
      });
    }

    let successCount = 0;
    let failCount = 0;

    for (const recipient of recipients) {
      try {
        if (process.env.RESEND_API_KEY) {
          const payload: Record<string, unknown> = {
            from: process.env.RESEND_FROM_EMAIL || 'noreply@raccloud.jp',
            to: [recipient.email],
            subject,
            text: bodyContent,
          };
          if (ccEmails?.length) payload.cc = ccEmails;
          if (bccEmails?.length) payload.bcc = bccEmails;
          if (replyTo) payload.reply_to = replyTo;

          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify(payload),
          });
          if (!resendResponse.ok) {
            const errText = await resendResponse.text();
            throw new Error(`Resend API error: ${errText}`);
          }
        }

        await db.insert(emailRecipients).values({
          id: randomUUID(),
          emailId,
          userId: recipient.userId || null,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          status: process.env.RESEND_API_KEY ? 'sent' : 'pending',
          sentAt: process.env.RESEND_API_KEY ? new Date().toISOString() : null,
        });
        successCount++;
      } catch (err) {
        await db.insert(emailRecipients).values({
          id: randomUUID(),
          emailId,
          userId: recipient.userId || null,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });
        failCount++;
      }
    }

    const finalStatus = failCount === 0 ? 'sent' : successCount === 0 ? 'failed' : 'sent';
    await db.update(emails)
      .set({ status: finalStatus, sentAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(emails.id, emailId));

    const message = process.env.RESEND_API_KEY
      ? `${successCount}件送信完了${failCount > 0 ? `、${failCount}件失敗` : ''}`
      : `${successCount}件をキュー登録（RESEND_API_KEY未設定のためテストモード）`;

    return NextResponse.json({ success: true, sent: successCount, failed: failCount, emailId, message });
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json({ error: 'メール送信に失敗しました' }, { status: 500 });
  }
}
