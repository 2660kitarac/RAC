import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, clubs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/auth/password';

// GET /api/settings - 現在のユーザーとクラブ設定を取得
export async function GET(_: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();

    const userResult = await db.select({
      id: users.id,
      name: users.name,
      nameKana: users.nameKana,
      email: users.email,
      phone: users.phone,
      role: users.role,
      memberType: users.memberType,
      position: users.position,
      joinedAt: users.joinedAt,
      birthDate: users.birthDate,
      addressZip: users.addressZip,
      address: users.address,
      occupation: users.occupation,
      allergy: users.allergy,
      dietaryNote: users.dietaryNote,
      emergencyContactName: users.emergencyContactName,
      emergencyContactPhone: users.emergencyContactPhone,
      memo: users.memo,
      clubId: users.clubId,
    }).from(users).where(eq(users.id, session.user.id)).limit(1);

    if (!userResult.length) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

    let clubData = null;
    if (userResult[0].clubId) {
      const clubResult = await db.select().from(clubs).where(eq(clubs.id, userResult[0].clubId)).limit(1);
      if (clubResult.length) clubData = clubResult[0];
    }

    return NextResponse.json({ user: userResult[0], club: clubData });
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return NextResponse.json({ error: '設定の取得に失敗しました' }, { status: 500 });
  }
}

// PATCH /api/settings - プロフィール・パスワード更新
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDbFromContext();
    const body = await request.json();
    const { target, ...data } = body;

    if (target === 'password') {
      // パスワード変更
      const { currentPassword, newPassword } = data;
      if (!currentPassword) {
        return NextResponse.json({ error: '現在のパスワードを入力してください' }, { status: 400 });
      }

      // パスワード強度検証（/api/profile/password と同じルール）
      const validationError = validatePassword(newPassword);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      if (currentPassword === newPassword) {
        return NextResponse.json({ error: '現在のパスワードと同じものは使用できません' }, { status: 400 });
      }

      const userResult = await db.select({ passwordHash: users.passwordHash })
        .from(users).where(eq(users.id, session.user.id)).limit(1);

      if (!userResult.length) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });

      const isValid = await bcrypt.compare(currentPassword, userResult[0].passwordHash);
      if (!isValid) return NextResponse.json({ error: '現在のパスワードが正しくありません' }, { status: 400 });

      const newHash = await bcrypt.hash(newPassword, 10);
      await db.update(users).set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
        .where(eq(users.id, session.user.id));

      return NextResponse.json({ success: true, message: 'パスワードを変更しました' });
    }

    if (target === 'profile') {
      // プロフィール更新
      const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      const allowedFields = ['name', 'nameKana', 'phone', 'position', 'birthDate', 'addressZip', 'address', 'occupation', 'allergy', 'dietaryNote', 'emergencyContactName', 'emergencyContactPhone', 'memo'];
      for (const field of allowedFields) {
        if (field in data) updateData[field] = data[field];
      }

      await db.update(users).set(updateData as any).where(eq(users.id, session.user.id));
      return NextResponse.json({ success: true, message: 'プロフィールを更新しました' });
    }

    if (target === 'club') {
      // クラブ設定更新（管理者のみ）
      if (!['admin', 'district_admin'].includes(session.user.role || '')) {
        return NextResponse.json({ error: '権限がありません' }, { status: 403 });
      }
      const { clubId, ...clubData } = data;
      const targetClubId = clubId || session.user.clubId;
      if (!targetClubId) return NextResponse.json({ error: 'clubId は必須です' }, { status: 400 });

      const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      const allowedClubFields = ['name', 'shortName', 'email', 'phone', 'address', 'contactName', 'memo', 'muFeePersonalBurden'];
      for (const field of allowedClubFields) {
        if (field in clubData) updateData[field] = clubData[field];
      }

      await db.update(clubs).set(updateData as any).where(eq(clubs.id, targetClubId));
      return NextResponse.json({ success: true, message: 'クラブ設定を更新しました' });
    }

    if (target === 'stamp') {
      // 電子印鑑設定（クラブ管理者のみ・自クラブのみ）
      const CLUB_MANAGER_ROLES = [
        'system_owner', 'district_admin', 'district_representative', 'district_secretary',
        'club_account', 'club_admin', 'president', 'secretary', 'treasurer',
      ];
      const role = session.user.role || '';
      if (!CLUB_MANAGER_ROLES.includes(role)) {
        return NextResponse.json({ error: '権限がありません' }, { status: 403 });
      }

      const DISTRICT_ROLES = ['system_owner', 'district_admin', 'district_representative', 'district_secretary'];
      const isDistrict = DISTRICT_ROLES.includes(role);
      const targetClubId = data.clubId || session.user.clubId;
      if (!targetClubId) {
        return NextResponse.json({ error: 'clubId は必須です' }, { status: 400 });
      }
      // 地区スタッフ以外は自クラブのみ変更可
      if (!isDistrict && targetClubId !== session.user.clubId) {
        return NextResponse.json({ error: '他クラブの設定は変更できません' }, { status: 403 });
      }

      const stampEnabled = !!data.stampEnabled;
      const stampImageUrl: string | null = data.stampImageUrl ?? null;
      const stampText: string | null = data.stampText ? String(data.stampText).trim() : null;

      // 画像は data URL のみ許可（外部URL埋め込みによる情報漏洩・XSS を防ぐ）
      if (stampImageUrl !== null) {
        if (!/^data:image\/(png|jpeg|webp);base64,/.test(stampImageUrl)) {
          return NextResponse.json(
            { error: '印影画像の形式が不正です（PNG / JPEG / WebP のみ）' },
            { status: 400 }
          );
        }
        // 1MB 相当を上限とする
        if (stampImageUrl.length > 1_400_000) {
          return NextResponse.json(
            { error: '印影画像が大きすぎます。より小さい画像をお試しください' },
            { status: 400 }
          );
        }
      }

      if (stampText !== null && stampText.length > 8) {
        return NextResponse.json({ error: '印影文字は8文字以内で入力してください' }, { status: 400 });
      }

      if (stampEnabled && !stampImageUrl && !stampText) {
        return NextResponse.json(
          { error: '印影画像または印影文字のいずれかを設定してください' },
          { status: 400 }
        );
      }

      await db.update(clubs).set({
        stampEnabled,
        stampImageUrl,
        stampText,
        updatedAt: new Date().toISOString(),
      } as any).where(eq(clubs.id, targetClubId));

      return NextResponse.json({ success: true, message: '印鑑設定を更新しました' });
    }

    return NextResponse.json({ error: 'target パラメータが不正です（profile / password / club / stamp）' }, { status: 400 });
  } catch (error) {
    console.error('PATCH /api/settings error:', error);
    return NextResponse.json({ error: '設定の更新に失敗しました' }, { status: 500 });
  }
}
