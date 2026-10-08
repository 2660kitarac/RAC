import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { emails, emailRecipients } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { resolveClubScope, canManageClub, canMutateClubRecord } from '@/lib/auth/tenant';

/** 1回の送信で扱う宛先数の上限（誤操作・悪用時の被害を抑える） */
const MAX_RECIPIENTS = 500;
/** メールアドレスの簡易検証（区切り文字や空白を含む値を弾く） */
const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const isEmail = (v: unknown): v is string => typeof v === 'string' && EMAIL_RE.test(v.trim());
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
    // メール送信はクラブ運営ロールのみ
    if (!canManageClub(session.user.role)) {
      return NextResponse.json({ error: 'メールを送信する権限がありません' }, { status: 403 });
    }

    const db = await getDbFromContext();
    const reqBody = await request.json();
    const {
      clubId, meetingId, templateId, subject, body: bodyContent,
      targetType, recipients, replyTo, emailId: existingEmailId,
    } = reqBody;
    // 送信画面は cc / bcc というキーで送ってくるため、両方の名前を受け付ける
    const ccEmails: string[] | undefined = reqBody.ccEmails ?? reqBody.cc;
    const bccEmails: string[] | undefined = reqBody.bccEmails ?? reqBody.bcc;

    if (!subject || !bodyContent) {
      return NextResponse.json({ error: 'subject と body は必須です' }, { status: 400 });
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: '送信先を1件以上指定してください' }, { status: 400 });
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `一度に送信できるのは${MAX_RECIPIENTS}件までです` }, { status: 400 });
    }
    for (const list of [ccEmails, bccEmails]) {
      if (list !== undefined && list !== null && (!Array.isArray(list) || list.length > 50 || !list.every(isEmail))) {
        return NextResponse.json({ error: 'CC / BCC のメールアドレスが正しくありません' }, { status: 400 });
      }
    }
    if (replyTo && !isEmail(replyTo)) {
      return NextResponse.json({ error: '返信先のメールアドレスが正しくありません' }, { status: 400 });
    }

    // ボディの clubId は信頼しない（他クラブ名義での作成を防ぐ）
    const writeScope = resolveClubScope(session.user, clubId);
    if (writeScope.forbidden) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    const resolvedClubId = writeScope.clubId;
    if (!resolvedClubId) return NextResponse.json({ error: '所属クラブが特定できません' }, { status: 400 });
    const ccJson = ccEmails?.length ? JSON.stringify(ccEmails) : null;
    const bccJson = bccEmails?.length ? JSON.stringify(bccEmails) : null;

    // メールレコードを作成 or 更新
    let emailId = existingEmailId;
    if (emailId) {
      // 既存の下書きは、自分が操作できるクラブのものに限る
      const [existing] = await db
        .select({ clubId: emails.clubId })
        .from(emails)
        .where(and(eq(emails.id, emailId), isNull(emails.deletedAt)))
        .limit(1);
      if (!existing || !canMutateClubRecord(session.user, existing.clubId)) {
        return NextResponse.json({ error: '対象のメールが見つかりません' }, { status: 404 });
      }
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

    // CC / BCC は最初の1通にだけ付ける（宛先ごとに付けると同じメールが何通も届く）
    let ccAttached = false;
    for (const recipient of recipients) {
      try {
        // 形式の正しくない宛先はその1件だけ失敗として記録する
        if (!isEmail(recipient?.email)) throw new Error('メールアドレスが未登録または形式が正しくありません');
        if (process.env.RESEND_API_KEY) {
          const payload: Record<string, unknown> = {
            from: process.env.RESEND_FROM_EMAIL || 'noreply@raccloud.jp',
            to: [recipient.email],
            subject,
            text: bodyContent,
          };
          if (!ccAttached) {
            if (ccEmails?.length) payload.cc = ccEmails;
            if (bccEmails?.length) payload.bcc = bccEmails;
          }
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
          ccAttached = true;
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
