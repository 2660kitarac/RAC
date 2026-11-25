/**
 * 出席レコードに紐づく「会員アカウント」の情報を取り出す SQL 式（サーバー専用）
 *
 * クラブアカウント（role = club_account）はクラブの共用ログインで、参加者本人ではない。
 * クラブアカウントで MU 登録フォームを開いて他の人を登録すると、出席レコードに
 * クラブアカウントの userId が付いてしまい、
 *   - 所属がすべて自クラブ扱いになる（他クラブ・ゲストでも「大阪北」などと表示）
 *   - 氏名が未入力だとクラブ名が参加者名として出る
 * という問題が起きていた。表示・集計ではクラブアカウントを「会員なし」として扱う。
 */
import { sql } from 'drizzle-orm';
import { users } from '@/lib/db/schema';

/** 参加者の所属判定に使う会員の所属クラブ（クラブアカウントなら NULL） */
export const participantUserClubId = sql<string | null>`CASE WHEN ${users.role} = 'club_account' THEN NULL ELSE ${users.clubId} END`;

/** 参加者名のフォールバックに使う会員名（クラブアカウントなら NULL） */
export const participantUserName = sql<string | null>`CASE WHEN ${users.role} = 'club_account' THEN NULL ELSE ${users.name} END`;

/** 参加者の連絡先に使う会員のメール（クラブアカウントなら NULL） */
export const participantUserEmail = sql<string | null>`CASE WHEN ${users.role} = 'club_account' THEN NULL ELSE ${users.email} END`;
