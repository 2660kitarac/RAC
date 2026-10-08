import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
  const db = await getDbFromContext();
  const profile = await db.select({
    id: users.id, name: users.name, nameKana: users.nameKana,
    birthDate: users.birthDate, phone: users.phone,
    addressZip: users.addressZip, address: users.address,
    occupation: users.occupation, allergy: users.allergy,
    dietaryNote: users.dietaryNote,
    emergencyContactName: users.emergencyContactName,
    emergencyContactPhone: users.emergencyContactPhone,
  }).from(users).where(and(eq(users.id, session.user.id), isNull(users.deletedAt)));
  return NextResponse.json({ profile: profile[0] ?? null });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
  const db = await getDbFromContext();
  const body = await request.json();
  // 送られてきた項目だけを更新する（送られなかった項目を空にしない）
  const fields = [
    'nameKana', 'birthDate', 'phone', 'addressZip', 'address', 'occupation',
    'allergy', 'dietaryNote', 'emergencyContactName', 'emergencyContactPhone',
  ];
  const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof body.name === 'string' && body.name.trim()) updateData.name = body.name;
  for (const f of fields) {
    if (f in body) updateData[f] = body[f] ?? null;
  }
  await db.update(users).set(updateData as any)
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)));
  return NextResponse.json({ success: true });
}
