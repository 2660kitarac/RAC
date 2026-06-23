import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull, like, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// GET /api/members - 会員一覧
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const url = new URL(request.url);
    const clubId = url.searchParams.get('clubId') || session.user.clubId;
    const search = url.searchParams.get('search') || '';
    const role = url.searchParams.get('role') || '';
    const isActive = url.searchParams.get('isActive');

    let conditions = and(
      clubId ? eq(users.clubId, clubId) : undefined,
      isNull(users.deletedAt),
      role ? eq(users.role, role) : undefined,
      isActive !== null ? eq(users.isActive, isActive === 'true') : undefined,
    );

    const results = await db.select({
      id: users.id, name: users.name, nameKana: users.nameKana,
      email: users.email, phone: users.phone, role: users.role,
      memberType: users.memberType, position: users.position,
      joinedAt: users.joinedAt, resignedAt: users.resignedAt,
      isActive: users.isActive, clubId: users.clubId,
      birthDate: users.birthDate, allergy: users.allergy,
      dietaryNote: users.dietaryNote, memo: users.memo,
      createdAt: users.createdAt,
    }).from(users).where(conditions);

    const filtered = search
      ? results.filter(u =>
          u.name.includes(search) ||
          (u.nameKana && u.nameKana.includes(search)) ||
          u.email.includes(search)
        )
      : results;

    return NextResponse.json({ members: filtered });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/members - 会員追加
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = getDbFromContext();
    const body = await request.json();
    const {
      name, nameKana, email, phone, role = 'member', memberType = 'RAC',
      position, joinedAt, birthDate, addressZip, address, occupation,
      allergy, dietaryNote, emergencyContactName, emergencyContactPhone, memo,
      password = 'changeme123',
    } = body;

    if (!name || !email) return NextResponse.json({ error: '名前とメールは必須です' }, { status: 400 });

    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();
    const clubId = body.clubId || session.user.clubId;

    await db.insert(users).values({
      id, clubId, name, nameKana, email, phone, role, memberType,
      position, joinedAt, birthDate, addressZip, address, occupation,
      allergy, dietaryNote, emergencyContactName, emergencyContactPhone,
      memo, passwordHash, isActive: true,
    });

    return NextResponse.json({ member: { id, name, email, role, memberType } });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
