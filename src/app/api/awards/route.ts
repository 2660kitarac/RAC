import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

// GET /api/awards - 表彰スコア一覧（スタブ：スキーマ追加後に実装）
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    // TODO: award_scores, award_score_items テーブルをスキーマに追加後に実装
    return NextResponse.json({
      scores: [],
      scoreItems: [],
      message: '表彰機能は準備中です',
    });
  } catch (error) {
    console.error('GET /api/awards error:', error);
    return NextResponse.json({ error: '表彰情報の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/awards - スコア更新（スタブ）
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    // TODO: award_scores テーブルをスキーマに追加後に実装
    return NextResponse.json({ success: true, message: '表彰機能は準備中です' });
  } catch (error) {
    console.error('POST /api/awards error:', error);
    return NextResponse.json({ error: '表彰スコアの更新に失敗しました' }, { status: 500 });
  }
}
