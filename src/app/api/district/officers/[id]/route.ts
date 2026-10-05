/**
 * 地区役員アカウント 1人分の変更
 *  PATCH { name?, role?, isActive?, password?, action?: 'remove' }
 *   - action:'remove' … 地区役員から外す（所属クラブがあれば個人会員に戻す／なければ停止）
 *  守ること：
 *   - 対象は担当地区の地区役員のみ（system_owner・クラブのアカウントは触らない）
 *   - 自分自身の役職変更・停止・役員から外すことはできない
 *   - 地区で最後の有効な地区管理者を外す・停止することはできない
 *   - 地区管理者の任命・地区管理者アカウントの変更は、地区管理者（または system_owner）のみ
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { canManageDistrictOfficers, isDistrictOfficer } from '@/lib/auth/tenant';
import { nowJst, requireDistrictContext } from '@/lib/district/context';
import {
  NAME_MAX, canGrantDistrictAdmin, countOtherActiveAdmins, findDistrictOfficer, passwordError, str,
} from '../_shared';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireDistrictContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.district) return NextResponse.json({ error: '地区が設定されていません' }, { status: 400 });
    if (!canManageDistrictOfficers(ctx.user.role)) {
      return NextResponse.json({ error: '地区役員を変更する権限がありません' }, { status: 403 });
    }
    const { db, district } = ctx;
    const { id } = await params;
    const target = await findDistrictOfficer(db, district.id, id);
    if (!target) return NextResponse.json({ error: '地区役員が見つかりません' }, { status: 404 });

    const isSelf = target.id === ctx.user.id;
    const isAdminActor = canGrantDistrictAdmin(ctx.user.role);
    // 地区管理者のアカウントは、地区管理者（または system_owner）だけが変更できる（本人の氏名・パスワードは除く）
    if (target.role === 'district_admin' && !isAdminActor && !isSelf) {
      return NextResponse.json({ error: '地区管理者のアカウントは地区管理者のみ変更できます' }, { status: 403 });
    }

    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const update: Partial<typeof users.$inferInsert> = {};

    // 地区管理者が減る操作のときは、他に有効な地区管理者がいるか確認する
    const ensureAnotherAdmin = async (): Promise<NextResponse | null> => {
      if (target.role !== 'district_admin' || !target.isActive) return null;
      const others = await countOtherActiveAdmins(db, district.id, target.id);
      if (others === 0) {
        return NextResponse.json({ error: '地区管理者が1人もいなくなるため、この操作はできません。先に別の方を地区管理者にしてください' }, { status: 400 });
      }
      return null;
    };

    // 同時操作で地区管理者が0人になっていないか、変更後にもう一度確認する（0人なら元に戻す）
    const verifyAdminsRemain = async (): Promise<NextResponse | null> => {
      if (target.role !== 'district_admin' || !target.isActive) return null;
      const remaining = await countOtherActiveAdmins(db, district.id, '__none__');
      if (remaining > 0) return null;
      await db.update(users).set({ role: target.role, isActive: target.isActive }).where(eq(users.id, target.id));
      return NextResponse.json({ error: '同時に別の変更が行われたため、地区管理者がいなくなる変更を取り消しました。画面を更新してやり直してください' }, { status: 409 });
    };

    // ── 地区役員から外す ──
    if (body.action === 'remove') {
      if (isSelf) return NextResponse.json({ error: '自分自身を地区役員から外すことはできません' }, { status: 400 });
      const blocked = await ensureAnotherAdmin();
      if (blocked) return blocked;
      const now = nowJst();
      if (target.clubId) {
        await db.update(users).set({ role: 'member', updatedAt: now }).where(eq(users.id, target.id));
        const reverted = await verifyAdminsRemain();
        if (reverted) return reverted;
        return NextResponse.json({ removed: true, result: 'member' });
      }
      await db.update(users).set({ isActive: false, updatedAt: now }).where(eq(users.id, target.id));
      const reverted = await verifyAdminsRemain();
      if (reverted) return reverted;
      return NextResponse.json({ removed: true, result: 'deactivated' });
    }

    // 氏名
    if (body.name !== undefined) {
      const name = str(body.name, NAME_MAX);
      if (!name) return NextResponse.json({ error: '氏名を入力してください' }, { status: 400 });
      if (name.length > NAME_MAX) return NextResponse.json({ error: `氏名は${NAME_MAX}文字以内で入力してください` }, { status: 400 });
      update.name = name;
    }

    // 役職
    if (body.role !== undefined && body.role !== target.role) {
      const role = typeof body.role === 'string' ? body.role : '';
      if (!isDistrictOfficer(role)) return NextResponse.json({ error: '役職を選んでください' }, { status: 400 });
      if (isSelf) return NextResponse.json({ error: '自分自身の役職は変更できません。ほかの地区管理者に依頼してください' }, { status: 400 });
      if (role === 'district_admin' && !isAdminActor) {
        return NextResponse.json({ error: '地区管理者を任命できるのは地区管理者のみです' }, { status: 403 });
      }
      const blocked = await ensureAnotherAdmin();
      if (blocked) return blocked;
      update.role = role;
    }

    // 停止・再開
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') return NextResponse.json({ error: '状態の指定が正しくありません' }, { status: 400 });
      if (body.isActive !== target.isActive) {
        if (isSelf) return NextResponse.json({ error: '自分自身のアカウントは停止できません' }, { status: 400 });
        if (!body.isActive) {
          const blocked = await ensureAnotherAdmin();
          if (blocked) return blocked;
        }
        update.isActive = body.isActive;
      }
    }

    // パスワード再設定
    if (body.password !== undefined && body.password !== '') {
      // 他の役員のパスワード再設定は、地区管理者（または system_owner）のみ
      if (!isSelf && !isAdminActor) {
        return NextResponse.json({ error: 'ほかの役員のパスワードを再設定できるのは地区管理者のみです' }, { status: 403 });
      }
      const pwErr = passwordError(body.password);
      if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
      update.passwordHash = await bcrypt.hash(body.password as string, 10);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ officer: target });
    }
    update.updatedAt = nowJst();
    await db.update(users).set(update).where(eq(users.id, target.id));
    if (update.role !== undefined || update.isActive === false) {
      const reverted = await verifyAdminsRemain();
      if (reverted) return reverted;
    }
    const officer = await findDistrictOfficer(db, district.id, target.id);
    return NextResponse.json({ officer });
  } catch (e) {
    console.error('PATCH /api/district/officers/[id] error:', e);
    return NextResponse.json({ error: '地区役員の変更に失敗しました' }, { status: 500 });
  }
}
