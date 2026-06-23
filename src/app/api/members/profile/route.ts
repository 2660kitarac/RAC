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
  await db.update(users).set({
    name: body.name, nameKana: body.nameKana ?? null,
    birthDate: body.birthDate ?? null, phone: body.phone ?? null,
    addressZip: body.addressZip ?? null, address: body.address ?? null,
    occupation: body.occupation ?? null, allergy: body.allergy ?? null,
    dietaryNote: body.dietaryNote ?? null,
    emergencyContactName: body.emergencyContactName ?? null,
    emergencyContactPhone: body.emergencyContactPhone ?? null,
    updatedAt: new Date().toISOString(),
  }).where(eq(users.id, session.user.id));
  return NextResponse.json({ success: true });
}
