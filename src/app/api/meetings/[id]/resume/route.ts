/**
 * 例会レジュメ API
 *  GET  /api/meetings/[id]/resume  … 組み立て済みのレジュメ一式
 *  PUT  /api/meetings/[id]/resume  … 例会の内容 / クラブ共通設定 / 会員名簿プロフィールを保存
 *
 * 保存できるのは、その例会のクラブを運営できるロール（会長・幹事・クラブアカウント等）のみ。
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import {
  clubResumeSettings,
  meetingResumes,
  meetings,
  memberResumeProfiles,
  users,
} from '@/lib/db/schema';
import { canManageClub, canMutateClubRecord } from '@/lib/auth/tenant';
import { buildResume, isMissingTable } from '@/lib/resume/build';
import type { ClubResumeSettings, MemberProfileInput, ResumeData } from '@/lib/resume/types';

type RouteContext = { params: Promise<{ id: string }> };

/** 画像（data URL）の上限。画面側で縮小してから送る（写真は約30KB、ロゴは数十KBが目安） */
const MAX_PHOTO_LENGTH = 200_000;
const MAX_LOGO_LENGTH = 400_000;
/** 1回の保存で受け付ける本文の上限（写真をまとめて送っても収まる大きさ） */
const MAX_BODY_BYTES = 4_000_000;
const now = sql`(now() AT TIME ZONE 'Asia/Tokyo')::text`;

function isImageDataUrl(v: unknown, max: number): v is string {
  return typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v) && v.length <= max;
}

/** 文字列を安全に切り詰める */
function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** 例会を取得し、操作してよいか確認する */
async function authorize(id: string) {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: '認証エラー' }, { status: 401 }) } as const;
  }
  const db = await getDbFromContext();
  const [m] = await db
    .select({ id: meetings.id, clubId: meetings.clubId })
    .from(meetings)
    .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
    .limit(1);
  if (!m) return { error: NextResponse.json({ error: '例会が見つかりません' }, { status: 404 }) } as const;
  const user = session.user as { id: string; role?: string; clubId?: string | null };
  if (!canManageClub(user.role) || !canMutateClubRecord(user, m.clubId)) {
    return { error: NextResponse.json({ error: '権限がありません' }, { status: 403 }) } as const;
  }
  return { db, meeting: m, user } as const;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await authorize(id);
    if ('error' in ctx) return ctx.error;
    const view = await buildResume(ctx.db, id);
    if (!view) return NextResponse.json({ error: '例会が見つかりません' }, { status: 404 });
    return NextResponse.json({ resume: view });
  } catch (e) {
    console.error('GET /api/meetings/[id]/resume error:', e);
    return NextResponse.json({ error: 'レジュメの取得に失敗しました' }, { status: 500 });
  }
}

/** 保存する例会内容を、想定した形だけに絞り込む */
function sanitizeData(input: unknown): ResumeData {
  const d = (input ?? {}) as Record<string, unknown>;
  const cat = (v: unknown) => (['rc', 'district', 'rac', 'other'].includes(v as string) ? (v as 'rc') : undefined);
  const mark = (v: unknown) => (['present', 'absent', 'none'].includes(v as string) ? (v as 'present') : undefined);

  const visitorOverrides: ResumeData['visitorOverrides'] = {};
  for (const [k, v] of Object.entries((d.visitorOverrides ?? {}) as Record<string, Record<string, unknown>>).slice(0, 300)) {
    visitorOverrides[k.slice(0, 64)] = {
      category: cat(v?.category),
      clubName: typeof v?.clubName === 'string' ? str(v.clubName, 100) : undefined,
      position: typeof v?.position === 'string' ? str(v.position, 100) : undefined,
      name: typeof v?.name === 'string' ? str(v.name, 100) : undefined,
      hidden: v?.hidden === true,
    };
  }

  const nextMeetingOverrides: ResumeData['nextMeetingOverrides'] = {};
  for (const [k, v] of Object.entries((d.nextMeetingOverrides ?? {}) as Record<string, Record<string, unknown>>).slice(0, 20)) {
    nextMeetingOverrides[k.slice(0, 64)] = {
      title: typeof v?.title === 'string' ? str(v.title, 200) : undefined,
      content: typeof v?.content === 'string' ? str(v.content, 500) : undefined,
      hidden: v?.hidden === true,
    };
  }

  const memberMarkOverrides: ResumeData['memberMarkOverrides'] = {};
  for (const [k, v] of Object.entries((d.memberMarkOverrides ?? {}) as Record<string, unknown>).slice(0, 300)) {
    const m = mark(v);
    if (m) memberMarkOverrides[k.slice(0, 64)] = m;
  }

  return {
    yearLabel: str(d.yearLabel, 50) || undefined,
    sessionLabel: str(d.sessionLabel, 50) || undefined,
    title: str(d.title, 100) || undefined,
    programItems: Array.isArray(d.programItems)
      ? d.programItems.slice(0, 30).map(s => str(s, 100)).filter(s => s.trim())
      : undefined,
    showSongs: d.showSongs === false ? false : undefined,
    visitorOverrides,
    extraVisitors: Array.isArray(d.extraVisitors)
      ? (d.extraVisitors as Array<Record<string, unknown>>).slice(0, 100).map((v, i) => ({
          id: str(v?.id, 64) || `extra-${i}`,
          category: cat(v?.category) ?? 'other',
          clubName: str(v?.clubName, 100),
          position: str(v?.position, 100),
          name: str(v?.name, 100),
        }))
      : undefined,
    nextMeetingCount:
      typeof d.nextMeetingCount === 'number' ? Math.max(0, Math.min(4, Math.floor(d.nextMeetingCount))) : undefined,
    nextMeetingOverrides,
    secretaryNote: str(d.secretaryNote, 3000) || undefined,
    showAttendance: d.showAttendance === false ? false : undefined,
    memberMarkOverrides,
  };
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await authorize(id);
    if ('error' in ctx) return ctx.error;
    const { db, meeting, user } = ctx;

    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: '一度に送る内容が大きすぎます。写真は数人ずつ保存してください' }, { status: 413 });
    }

    const body = (await request.json().catch(() => null)) as {
      data?: unknown;
      settings?: Partial<ClubResumeSettings>;
      profiles?: unknown[];
    } | null;
    if (!body || typeof body !== 'object') return NextResponse.json({ error: '内容が空です' }, { status: 400 });

    // ===== 先にすべて検証する（途中まで保存されて失敗、を防ぐ） =====
    const data = body.data !== undefined ? sanitizeData(body.data) : null;

    let settingsValues: Record<string, string | null> | null = null;
    if (body.settings && typeof body.settings === 'object') {
      const s = body.settings;
      if (s.logoUrl && !isImageDataUrl(s.logoUrl, MAX_LOGO_LENGTH)) {
        return NextResponse.json({ error: 'ロゴ画像の形式またはサイズが正しくありません' }, { status: 400 });
      }
      settingsValues = {
        headerLabel: str(s.headerLabel, 100),
        sponsorName: str(s.sponsorName, 100),
        logoUrl: s.logoUrl || null,
        anthemTitle: str(s.anthemTitle, 50),
        anthemText: str(s.anthemText, 1000),
        songTitle: str(s.songTitle, 50),
        songText: str(s.songText, 2000),
      };
    }

    const profiles = (Array.isArray(body.profiles) ? body.profiles : [])
      .filter((p): p is MemberProfileInput =>
        !!p && typeof p === 'object' && typeof (p as MemberProfileInput).userId === 'string')
      .slice(0, 200);
    for (const p of profiles) {
      if (p.photoUrl && !isImageDataUrl(p.photoUrl, MAX_PHOTO_LENGTH)) {
        return NextResponse.json({ error: '写真の形式またはサイズが正しくありません' }, { status: 400 });
      }
    }
    if (profiles.length > 0) {
      // 他クラブの会員を書き換えられないよう、例会のクラブに所属しているかを確かめる
      const ids = Array.from(new Set(profiles.map(p => p.userId)));
      const owned = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, ids), eq(users.clubId, meeting.clubId), isNull(users.deletedAt)));
      if (owned.length !== ids.length) {
        return NextResponse.json({ error: '他クラブの会員は編集できません' }, { status: 403 });
      }
    }

    // ===== まとめて保存（どれか失敗したら全部取り消す） =====
    await db.transaction(async tx => {
      if (data) {
        await tx
          .insert(meetingResumes)
          .values({ meetingId: meeting.id, clubId: meeting.clubId, data, updatedBy: user.id })
          .onConflictDoUpdate({
            target: meetingResumes.meetingId,
            set: { data, updatedBy: user.id, updatedAt: now },
          });
      }
      if (settingsValues) {
        await tx
          .insert(clubResumeSettings)
          .values({ clubId: meeting.clubId, ...settingsValues })
          .onConflictDoUpdate({ target: clubResumeSettings.clubId, set: { ...settingsValues, updatedAt: now } });
      }
      for (const p of profiles) {
        const values = {
          clubId: meeting.clubId,
          nameEn: str(p.nameEn, 100),
          committee: str(p.committee, 100),
          company: str(p.company, 100),
          photoUrl: p.photoUrl || null,
        };
        await tx
          .insert(memberResumeProfiles)
          .values({ userId: p.userId, ...values })
          .onConflictDoUpdate({ target: memberResumeProfiles.userId, set: { ...values, updatedAt: now } });
      }
    });

    const view = await buildResume(db, meeting.id);
    return NextResponse.json({ resume: view });
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json(
        { error: 'レジュメ用のテーブルがまだ作成されていません（migrations/0011_meeting_resume.sql を適用してください）' },
        { status: 503 },
      );
    }
    console.error('PUT /api/meetings/[id]/resume error:', e);
    return NextResponse.json({ error: 'レジュメの保存に失敗しました' }, { status: 500 });
  }
}
