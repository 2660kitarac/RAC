/**
 * GET /api/my/meetings/[id]/participants
 * 会員向け：例会の参加者一覧（自クラブ会員 ＋ MU・ビジター）を返す
 *
 * 一般会員にも表示するため、返却項目は最小限に絞る。
 * メールアドレス・電話番号・費用・支払情報・備考・領収書情報は絶対に返さない。
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { meetings, attendances, users, clubs } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { isDistrictScope } from '@/lib/auth/tenant';

// 参加扱いとする区分（欠席・キャンセル待ちは除く）
const COMING_TYPES = ['meeting_only', 'meeting_and_party', 'party_only'] as const;

// 役職の表示順（ここに無い役職はその後、役職なしは最後）
const POSITION_ORDER = ['会長', '直前会長', '会長エレクト', '副会長', '幹事', '副幹事', '会計'];

function positionRank(position: string | null): number {
  if (!position) return POSITION_ORDER.length + 1;
  const idx = POSITION_ORDER.indexOf(position.trim());
  return idx >= 0 ? idx : POSITION_ORDER.length;
}

/** note から「【役職】xxx」の行だけを取り出す（それ以外の備考は返さない） */
function parsePositionFromNote(note: string | null): string | null {
  if (!note) return null;
  for (const line of note.split(/\r?\n/)) {
    const m = line.match(/^\s*【役職】\s*(.+?)\s*$/);
    if (m && m[1]) return m[1];
  }
  return null;
}

type MemberRow = {
  id: string;
  name: string;
  participationType: string;
  position: string | null;
};

type VisitorRow = MemberRow & {
  clubName: string | null;
  memberType: string;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const { id } = await params;
    const db = await getDbFromContext();

    // 例会の取得（削除済みは対象外）
    const [meeting] = await db
      .select({ id: meetings.id, title: meetings.title, date: meetings.date, clubId: meetings.clubId })
      .from(meetings)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .limit(1);
    if (!meeting) return NextResponse.json({ error: '例会が見つかりません' }, { status: 404 });

    // 閲覧権限：自クラブの例会のみ（地区スタッフは全クラブ閲覧可）
    // clubId はログイン情報ではなく、いまの users テーブルの値で判定する
    // （退会・移籍・削除済みの人が古いログイン情報で見られないようにする）
    const [userRecord] = await db
      .select({ clubId: users.clubId, role: users.role })
      .from(users)
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
      .limit(1);
    if (!userRecord) {
      return NextResponse.json({ error: 'この例会の参加者は閲覧できません' }, { status: 403 });
    }
    const myClubId = userRecord.clubId ?? null;
    const role = userRecord.role ?? null;

    if (!isDistrictScope(role) && (!myClubId || myClubId !== meeting.clubId)) {
      return NextResponse.json({ error: 'この例会の参加者は閲覧できません' }, { status: 403 });
    }

    // 出席記録の取得（必要な列だけを select し、個人情報・金銭情報は取得しない）
    const rows = await db
      .select({
        id: attendances.id,
        userId: attendances.userId,
        externalName: attendances.externalName,
        attendanceClubName: attendances.clubName,
        memberType: attendances.memberType,
        registrationType: attendances.registrationType,
        participationType: attendances.participationType,
        attendanceStatus: attendances.attendanceStatus,
        note: attendances.note, // 役職の抽出のみに使用し、レスポンスには含めない
        userName: users.name,
        userClubId: users.clubId,
        userPosition: users.position,
        userClubName: clubs.name,
        userClubShortName: clubs.shortName,
      })
      .from(attendances)
      .leftJoin(users, eq(attendances.userId, users.id))
      .leftJoin(clubs, eq(users.clubId, clubs.id))
      .where(and(eq(attendances.meetingId, meeting.id), isNull(attendances.deletedAt)));

    const members: MemberRow[] = [];
    const visitors: VisitorRow[] = [];
    let waitlistCount = 0;

    for (const r of rows) {
      const type = r.participationType;
      if (type === 'waitlist') {
        waitlistCount += 1;
        continue;
      }
      if (!(COMING_TYPES as readonly string[]).includes(type)) continue; // 欠席・未定等は除外
      if (r.attendanceStatus === 'absent') continue; // 例会後に欠席と確定した人も除外

      const name = r.externalName ?? r.userName ?? '（氏名未登録）';
      const isOwnClubMember =
        !!r.userId && r.userClubId === meeting.clubId && r.registrationType !== 'mu';

      if (isOwnClubMember) {
        members.push({
          id: r.id,
          name,
          participationType: type,
          position: r.userPosition ?? null,
        });
      } else {
        visitors.push({
          id: r.id,
          name,
          participationType: type,
          clubName: r.attendanceClubName ?? r.userClubShortName ?? r.userClubName ?? null,
          memberType: r.memberType,
          position: parsePositionFromNote(r.note),
        });
      }
    }

    // 並び順：自クラブは役職順→氏名、ビジターはクラブ名→氏名
    members.sort(
      (a, b) =>
        positionRank(a.position) - positionRank(b.position) ||
        a.name.localeCompare(b.name, 'ja'),
    );
    visitors.sort(
      (a, b) =>
        (a.clubName ?? '').localeCompare(b.clubName ?? '', 'ja') ||
        a.name.localeCompare(b.name, 'ja'),
    );

    const all = [...members, ...visitors];
    const counts = {
      members: members.length,
      visitors: visitors.length,
      total: all.length,
      meetingOnly: all.filter(p => p.participationType === 'meeting_only').length,
      withParty: all.filter(p => p.participationType === 'meeting_and_party').length,
      partyOnly: all.filter(p => p.participationType === 'party_only').length,
    };

    return NextResponse.json({
      meeting: { id: meeting.id, title: meeting.title, date: meeting.date },
      members,
      visitors,
      counts,
      waitlistCount,
    });
  } catch (error) {
    console.error('GET /api/my/meetings/[id]/participants error:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}
