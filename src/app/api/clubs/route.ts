import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// GET /api/clubs?type=RAC&isActive=true
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const isActive = url.searchParams.get('isActive');
    const districtId = url.searchParams.get('districtId');
    const excludeSystem = url.searchParams.get('excludeSystem');

    const conditions = and(
      isNull(clubs.deletedAt),
      type ? eq(clubs.type, type) : undefined,
      isActive !== null ? eq(clubs.isActive, isActive === 'true') : undefined,
      districtId ? eq(clubs.districtId, districtId) : undefined,
      excludeSystem === 'true' ? eq(clubs.isSystemClub, false) : undefined,
    );

    const results = await db.select({
      id: clubs.id,
      districtId: clubs.districtId,
      zoneId: clubs.zoneId,
      name: clubs.name,
      shortName: clubs.shortName,
      slug: clubs.slug,
      type: clubs.type,
      district: clubs.district,
      area: clubs.area,
      email: clubs.email,
      phone: clubs.phone,
      address: clubs.address,
      contactName: clubs.contactName,
      memo: clubs.memo,
      isActive: clubs.isActive,
      isSystemClub: clubs.isSystemClub,
      createdAt: clubs.createdAt,
      updatedAt: clubs.updatedAt,
    }).from(clubs).where(conditions).orderBy(clubs.name);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/clubs error:', error);
    return NextResponse.json({ error: 'クラブ一覧の取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/clubs - クラブ追加（管理者のみ）
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    if (!['system_owner', 'admin', 'district_admin'].includes(session.user.role || '')) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const db = await getDbFromContext();
    const body = await request.json();
    const { name, shortName, slug, type, districtId, zoneId, district, area, email, phone, address, contactName, memo } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'name, type は必須です' }, { status: 400 });
    }

    const id = randomUUID();
    await db.insert(clubs).values({
      id,
      districtId: districtId || null,
      zoneId: zoneId || null,
      name,
      shortName: shortName || null,
      slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
      type,
      district: district || null,
      area: area || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      contactName: contactName || null,
      memo: memo || null,
      isActive: true,
      isSystemClub: false,
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/clubs error:', error);
    return NextResponse.json({ error: 'クラブの追加に失敗しました' }, { status: 500 });
  }
}
