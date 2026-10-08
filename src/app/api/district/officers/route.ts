/**
 * 地区役員アカウント管理
 *  GET  … 担当地区の役員一覧
 *  POST … 役員を追加
 *         { mode:'create', name, email, role, password, clubId? }  新しいアカウントを作る
 *         { mode:'promote', email, role }                         既存の会員を地区役員にする
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
import { clubs, users } from '@/lib/db/schema';
import { canManageDistrictOfficers, isDistrictOfficer } from '@/lib/auth/tenant';
import { nowJst, requireDistrictContext } from '@/lib/district/context';
import {
  EMAIL_MAX, EMAIL_RE, NAME_MAX, canGrantDistrictAdmin, districtClubIds,
  findDistrictOfficer, findUserByEmail, listOfficers, passwordError, str,
} from './_shared';

export async function GET() {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.district) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });
    const officers = await listOfficers(ctx.db, ctx.district.id);
    return NextResponse.json({ officers, canManage: canManageDistrictOfficers(ctx.user.role) });
  } catch (e) {
    console.error('GET /api/district/officers error:', e);
    return NextResponse.json({ error: '地区役員の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.district) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });
    if (!canManageDistrictOfficers(ctx.user.role)) {
      return NextResponse.json({ error: '地区役員を追加する権限がありません' }, { status: 403 });
    }
    const { db, district } = ctx;
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

    // 役職の確認
    const role = typeof body.role === 'string' ? body.role : '';
    if (!isDistrictOfficer(role)) return NextResponse.json({ error: '役職を選んでください' }, { status: 400 });
    if (role === 'district_admin' && !canGrantDistrictAdmin(ctx.user.role)) {
      return NextResponse.json({ error: '地区管理者を任命できるのは地区管理者のみです' }, { status: 403 });
    }

    const email = str(body.email, EMAIL_MAX);
    if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'メールアドレスを正しく入力してください' }, { status: 400 });
    }
    const existing = await findUserByEmail(db, email);
    const now = nowJst();

    // ── 既存の会員を地区役員にする ──
    if (body.mode === 'promote') {
      if (!existing || existing.deletedAt) {
        return NextResponse.json({ error: 'このメールアドレスの会員は見つかりませんでした' }, { status: 404 });
      }
      if (existing.role === 'system_owner') {
        return NextResponse.json({ error: 'このアカウントは変更できません' }, { status: 403 });
      }
      // 無効・承認待ち・却下のアカウントは地区役員にしない
      if (!existing.isActive || existing.status !== 'active') {
        return NextResponse.json({ error: 'このアカウントは有効になっていないため、地区役員にできません' }, { status: 400 });
      }
      if (existing.role === 'club_account') {
        return NextResponse.json({ error: 'クラブアカウントは地区役員にできません。個人のアカウントを指定してください' }, { status: 400 });
      }
      if (isDistrictOfficer(existing.role)) {
        return NextResponse.json({ error: 'この方はすでに地区役員です。一覧から役職を変更してください' }, { status: 409 });
      }
      // クラブの管理役（会長・幹事・会計など）は、クラブ側の権限が消えてしまうため対象外
      if (existing.role !== 'member') {
        return NextResponse.json({
          error: 'この方はクラブの役割（会長・幹事など）を持っているため、地区役員にするとクラブの管理ができなくなります。「新しく作成」で地区役員用のアカウントを別に作ってください',
        }, { status: 400 });
      }
      // 同じ地区の会員に限る（他地区の会員は対象外）
      const clubIds = await districtClubIds(db, district.id);
      const sameDistrict = existing.districtId === district.id
        || (!existing.districtId && !!existing.clubId && clubIds.includes(existing.clubId));
      if (!sameDistrict) {
        return NextResponse.json({ error: 'この地区のクラブに所属する会員ではありません' }, { status: 400 });
      }
      await db
        .update(users)
        .set({ role, districtId: district.id, updatedAt: now })
        .where(eq(users.id, existing.id));
      const officer = await findDistrictOfficer(db, district.id, existing.id);
      return NextResponse.json({ officer });
    }

    // ── 新しいアカウントを作る ──
    if (existing) {
      return NextResponse.json({
        error: 'このメールアドレスはすでに登録されています。既存の会員を地区役員にする場合は、役職変更から行ってください',
        code: 'EMAIL_EXISTS',
      }, { status: 409 });
    }
    const name = str(body.name, NAME_MAX);
    if (!name) return NextResponse.json({ error: '氏名を入力してください' }, { status: 400 });
    if (name.length > NAME_MAX) return NextResponse.json({ error: `氏名は${NAME_MAX}文字以内で入力してください` }, { status: 400 });
    const pwErr = passwordError(body.password);
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

    // 所属クラブ（任意）は同じ地区のクラブに限る
    let clubId: string | null = null;
    if (typeof body.clubId === 'string' && body.clubId) {
      const [c] = await db
        .select({ id: clubs.id })
        .from(clubs)
        .where(and(eq(clubs.id, body.clubId.slice(0, 64)), eq(clubs.districtId, district.id), isNull(clubs.deletedAt)))
        .limit(1);
      if (!c) return NextResponse.json({ error: '所属クラブが見つかりません' }, { status: 400 });
      clubId = c.id;
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(body.password as string, 10);
    await db.insert(users).values({
      id,
      name,
      email,
      passwordHash,
      role,
      districtId: district.id,
      clubId,
      memberType: 'RAC',
      status: 'active',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const officer = await findDistrictOfficer(db, district.id, id);
    return NextResponse.json({ officer }, { status: 201 });
  } catch (e) {
    console.error('POST /api/district/officers error:', e);
    return NextResponse.json({ error: '地区役員の追加に失敗しました' }, { status: 500 });
  }
}
