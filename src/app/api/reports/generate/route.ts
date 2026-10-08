import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { canManageClub } from '@/lib/auth/tenant';

/** プロンプトに入れる文字列の長さを制限する（APIキーの悪用・過大な課金を防ぐ） */
const clip = (v: unknown, max = 1000) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));

function generateSampleReport(meeting: any, stats: any, notes: string): string {
  return `【例会報告】${meeting.title}

開催日：${meeting.date}
場所：${meeting.venue_name || '未設定'}
テーマ：${meeting.theme || '未設定'}
参加者：${stats.participants_count}名

${notes ? `備考：${notes}` : ''}

本例会では充実した議論が行われ、会員の親睦を深める機会となりました。
ご参加いただいた皆様に感謝申し上げます。`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    // 報告文の生成はクラブ運営ロールのみ
    if (!canManageClub(session.user.role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw.meeting !== 'object' || raw.meeting === null) {
      return NextResponse.json({ error: '例会情報が必要です' }, { status: 400 });
    }
    const m = raw.meeting as Record<string, unknown>;
    const meeting = {
      title: clip(m.title, 200), date: clip(m.date, 40), venue_name: clip(m.venue_name, 200),
      theme: clip(m.theme, 300), committee: clip(m.committee, 200), description: clip(m.description, 2000),
    };
    const count = Number((raw.stats as Record<string, unknown> | undefined)?.participants_count);
    const stats = { participants_count: Number.isFinite(count) ? count : 0 };
    const notes = clip(raw.notes, 2000);

    if (!process.env.OPENAI_API_KEY) {
      const sampleReport = generateSampleReport(meeting, stats, notes);
      return NextResponse.json({ report: sampleReport });
    }

    const prompt = `あなたはローターアクトクラブの例会報告文を作成する事務局担当です。
以下の例会情報をもとに、地区報告やクラブ内共有に使える丁寧な報告文を作成してください。

【例会情報】
例会名：${meeting.title}
開催日：${meeting.date}
場所：${meeting.venue_name || '未設定'}
テーマ：${meeting.theme || '未設定'}
担当委員会：${meeting.committee || '未設定'}
内容：${meeting.description || '未設定'}

【参加者情報】
参加人数：${stats.participants_count}名

【備考・特記事項】
${notes || 'なし'}

報告文（400文字程度）：`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
      }),
    });

    const data = await res.json() as any;
    const report = data.choices?.[0]?.message?.content || generateSampleReport(meeting, stats, notes);
    return NextResponse.json({ report });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
