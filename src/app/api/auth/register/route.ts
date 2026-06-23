import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      email,
      password,
      name,
      nameKana,
      phone,
      birthDate,
      addressZip,
      address,
      occupation,
      allergy,
      dietaryNote,
      emergencyContactName,
      emergencyContactPhone,
    } = body;

    if (!email || !password || !name) {
      return NextResponse.json({ error: '必須項目が入力されていません' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'パスワードは8文字以上にしてください' }, { status: 400 });
    }

    const db = await getDbFromContext();

    // メールアドレス重複チェック
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 400 });
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(password, 12);

    // ユーザー作成
    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash,
      name,
      nameKana: nameKana || null,
      phone: phone || null,
      birthDate: birthDate || null,
      addressZip: addressZip || null,
      address: address || null,
      occupation: occupation || null,
      allergy: allergy || null,
      dietaryNote: dietaryNote || null,
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone: emergencyContactPhone || null,
      role: 'member',
      memberType: 'RAC',
      isActive: true,
    });

    return NextResponse.json({ success: true, userId });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 });
  }
}
