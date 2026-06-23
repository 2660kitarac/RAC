import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

// GET /api/district - 地区イベント一覧（スタブ：スキーマ追加後に実装）
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    // TODO: district_events テーブルをスキーマに追加後に実装
    return NextResponse.json({
      events: [],
      message: '地区イベント機能は準備中です',
    });
  } catch (error) {
    console.error('GET /api/district error:', error);
    return NextResponse.json({ error: '地区イベントの取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/district - 地区イベント作成（スタブ）
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    // TODO: district_events テーブルをスキーマに追加後に実装
    return NextResponse.json({ success: true, message: '地区イベント機能は準備中です' });
  } catch (error) {
    console.error('POST /api/district error:', error);
    return NextResponse.json({ error: '地区イベントの作成に失敗しました' }, { status: 500 });
  }
}
