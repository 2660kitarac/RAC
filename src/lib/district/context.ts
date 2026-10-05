/**
 * 地区役員向け画面・API の共通処理（サーバー専用）
 *  - ログイン中のユーザーが地区役員（または system_owner）か確認
 *  - 担当地区（districtId）と地区名を解決
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { clubs, districts, users } from '@/lib/db/schema';
import { isDistrictStaff } from '@/lib/auth/tenant';

export type Db = Awaited<ReturnType<typeof getDbFromContext>>;

export type DistrictInfo = { id: string; name: string; number: string | null; label: string };

export type DistrictContext = {
  db: Db;
  user: { id: string; name: string; role: string; clubId: string | null; email: string };
  district: DistrictInfo | null;
};

/** 地区の表示名（第2660地区） */
export function districtLabel(d: { name: string; districtNumber?: string | null } | null | undefined): string {
  if (!d) return '';
  return d.districtNumber ? `第${d.districtNumber}地区` : d.name;
}

/** ユーザーの担当地区を解決する（本人の district_id → 所属クラブの地区 → 地区が1つだけならそれ） */
export async function resolveDistrict(
  db: Db,
  me: { districtId: string | null; clubId: string | null; role?: string | null },
): Promise<DistrictInfo | null> {
  let districtId = me.districtId;
  if (!districtId && me.clubId) {
    const [c] = await db.select({ districtId: clubs.districtId }).from(clubs).where(eq(clubs.id, me.clubId)).limit(1);
    districtId = c?.districtId ?? null;
  }
  if (districtId) {
    const [d] = await db
      .select({ id: districts.id, name: districts.name, number: districts.districtNumber })
      .from(districts)
      .where(and(eq(districts.id, districtId), isNull(districts.deletedAt)))
      .limit(1);
    if (d) return { ...d, label: districtLabel({ name: d.name, districtNumber: d.number }) };
  }
  const ds = await db
    .select({ id: districts.id, name: districts.name, number: districts.districtNumber })
    .from(districts)
    .where(isNull(districts.deletedAt))
    .orderBy(asc(districts.createdAt))
    .limit(2);
  // 地区が1つだけならその地区。system_owner は複数あっても最初の地区を表示する
  if (ds.length === 1 || (ds.length > 1 && me.role === 'system_owner')) {
    return { ...ds[0], label: districtLabel({ name: ds[0].name, districtNumber: ds[0].number }) };
  }
  return null;
}

/**
 * 地区役員として認証する（API 用）
 * 失敗時は { ok:false, status, error } を返すので、そのまま NextResponse.json に使う
 */
export async function requireDistrictContext(): Promise<
  ({ ok: true } & DistrictContext) | { ok: false; status: number; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401, error: 'ログインしてください' };
  const db = await getDbFromContext();
  const [me] = await db
    .select({
      id: users.id, name: users.name, role: users.role, clubId: users.clubId,
      districtId: users.districtId, email: users.email,
    })
    .from(users)
    // 停止中・承認待ちのアカウントは、ログイン中でも地区の操作をさせない
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt), eq(users.isActive, true), eq(users.status, 'active')))
    .limit(1);
  if (!me || !isDistrictStaff(me.role)) return { ok: false, status: 403, error: '地区役員のみ利用できます' };
  const district = await resolveDistrict(db, me);
  return {
    ok: true,
    db,
    user: { id: me.id, name: me.name, role: me.role, clubId: me.clubId, email: me.email },
    district,
  };
}

/** 現在の日付（JST, YYYY-MM-DD） */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 現在の日時（JST, 'YYYY-MM-DD HH:MM:SS'） */
export function nowJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
}

/** ローターアクト年度（7/1〜6/30）の開始日・終了日 */
export function racYearRange(date = todayJst()): { start: string; end: string; label: string } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const startYear = m >= 7 ? y : y - 1;
  return {
    start: `${startYear}-07-01`,
    end: `${startYear + 1}-06-30`,
    label: `${startYear}-${String(startYear + 1).slice(2)}年度`,
  };
}

/**
 * 地区役員として認証する（ページ用）。ログインしていなければ /login、
 * 地区役員でなければ /dashboard に移動する
 */
export async function requireDistrictPage(): Promise<DistrictContext> {
  const ctx = await requireDistrictContext();
  if (!ctx.ok) redirect(ctx.status === 401 ? '/login' : '/dashboard');
  const { ok: _ok, ...rest } = ctx as { ok: true } & DistrictContext;
  void _ok;
  return rest;
}
