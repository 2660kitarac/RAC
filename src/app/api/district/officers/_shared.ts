/**
 * 地区役員アカウント管理 API の共通処理（サーバー専用）
 */
import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { clubs, users } from '@/lib/db/schema';
import { DISTRICT_OFFICER_ROLES, isDistrictOfficer } from '@/lib/auth/tenant';
import type { Db } from '@/lib/district/context';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt が扱える上限
export const NAME_MAX = 50;
export const EMAIL_MAX = 254;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 地区管理者（district_admin）を付け外しできるロール */
export function canGrantDistrictAdmin(role: string | null | undefined): boolean {
  return role === 'system_owner' || role === 'district_admin';
}

/** 画面に返す地区役員の形（passwordHash は含めない） */
export type OfficerRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  clubId: string | null;
  clubName: string | null;
  districtId: string | null;
  isActive: boolean;
};

const officerColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  clubId: users.clubId,
  clubName: clubs.name,
  districtId: users.districtId,
  isActive: users.isActive,
};

/** 地区に属するクラブのID一覧 */
export async function districtClubIds(db: Db, districtId: string): Promise<string[]> {
  const rows = await db
    .select({ id: clubs.id })
    .from(clubs)
    .where(and(eq(clubs.districtId, districtId), isNull(clubs.deletedAt)));
  return rows.map(r => r.id);
}

/** 「この地区の人」の条件（users.districtId が地区 or 所属クラブが地区内） */
function inDistrict(districtId: string, clubIds: string[]) {
  return clubIds.length > 0
    ? or(eq(users.districtId, districtId), inArray(users.clubId, clubIds))
    : eq(users.districtId, districtId);
}

/** 地区の役員一覧 */
export async function listOfficers(db: Db, districtId: string): Promise<OfficerRow[]> {
  const clubIds = await districtClubIds(db, districtId);
  const rows = await db
    .select(officerColumns)
    .from(users)
    .leftJoin(clubs, eq(users.clubId, clubs.id))
    .where(and(
      isNull(users.deletedAt),
      inArray(users.role, [...DISTRICT_OFFICER_ROLES]),
      inDistrict(districtId, clubIds),
    ))
    .orderBy(users.name);
  const order = DISTRICT_OFFICER_ROLES as readonly string[];
  return (rows as OfficerRow[]).sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const r = order.indexOf(a.role) - order.indexOf(b.role);
    return r !== 0 ? r : a.name.localeCompare(b.name, 'ja');
  });
}

/** 地区内の役員1人を取得（地区外・役員以外は null） */
export async function findDistrictOfficer(db: Db, districtId: string, id: string): Promise<OfficerRow | null> {
  const clubIds = await districtClubIds(db, districtId);
  const [row] = await db
    .select(officerColumns)
    .from(users)
    .leftJoin(clubs, eq(users.clubId, clubs.id))
    .where(and(eq(users.id, id.slice(0, 64)), isNull(users.deletedAt), inDistrict(districtId, clubIds)))
    .limit(1);
  if (!row || !isDistrictOfficer(row.role)) return null;
  return row as OfficerRow;
}

/** 対象以外に、有効な地区管理者が何人いるか */
export async function countOtherActiveAdmins(db: Db, districtId: string, excludeId: string): Promise<number> {
  const clubIds = await districtClubIds(db, districtId);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(
      isNull(users.deletedAt),
      eq(users.role, 'district_admin'),
      eq(users.isActive, true),
      ne(users.id, excludeId),
      inDistrict(districtId, clubIds),
    ));
  return Number(r?.n ?? 0);
}

/** メールアドレスで既存ユーザーを探す（大文字小文字を区別しない） */
export async function findUserByEmail(db: Db, email: string) {
  const [row] = await db
    .select({
      id: users.id, name: users.name, email: users.email, role: users.role,
      clubId: users.clubId, districtId: users.districtId, isActive: users.isActive, deletedAt: users.deletedAt,
    })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  return row ?? null;
}

export function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max + 1) : '';
}

/** パスワードの検証（問題なければ null） */
export function passwordError(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < PASSWORD_MIN) return `パスワードは${PASSWORD_MIN}文字以上で入力してください`;
  if (p.length > PASSWORD_MAX) return `パスワードは${PASSWORD_MAX}文字以内で入力してください`;
  if (/\s/.test(p)) return 'パスワードに空白は使えません';
  return null;
}
