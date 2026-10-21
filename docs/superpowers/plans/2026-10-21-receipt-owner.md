# 領収書に会員IDを持たせ、会員画面を本人の領収書だけにする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `receipts` に会員ID（`user_id`）を追加して発行時に記録し、会員画面（マイ領収書・会員トップページ）には本人の発行済み領収書だけを表示・印刷できるようにする。

**Architecture:** マイグレーションで列・索引の追加と既存データの埋め戻しを行う。「本人の領収書」の条件と「手入力発行時の会員ID決定」を `src/lib/receipts/owner.ts` の純粋な関数にまとめてテストし、発行 API 3か所と会員画面3か所から使う。

**Tech Stack:** Next.js 15（App Router・Server Components）、TypeScript、Drizzle ORM（PostgreSQL / Supabase）、テストは esbuild で実コードを読み込む node スクリプト

**Spec:** `docs/superpowers/specs/2026-10-21-receipt-owner-design.md`

## Global Constraints

- 作業ブランチ：`claude/receipt-owner`（仕様書のコミット `37a11b0` の上に積む）
- マイグレーションは `migrations/0014_receipt_user_id.sql`。何度実行しても結果が変わらないこと（`IF NOT EXISTS`、`user_id IS NULL` の行だけ更新）
- `receipts.user_id` は空を許す（`TEXT NULL REFERENCES users(id)`）
- 本人の領収書の条件：`receipts.user_id = 会員ID` かつ `status = 'issued'` かつ `deleted_at IS NULL`。会員画面ではクラブの条件（`club_id`）も併せてかける
- 本人の領収書でない印刷ページは 404
- 手入力発行では、指定された出欠記録が発行するクラブの例会のものであるときだけ会員IDを記録する。画面（`ReceiptsList.tsx`）は変更しない
- リリース順：本番 Supabase にマイグレーション適用 → 確認用 SQL で件数確認 → PR マージ。これより前にマージしない
- `password.txt`（未追跡）は絶対にコミットしない。`git add` はファイルを個別に指定する
- 変更したファイルの Lint のエラー・警告数を main から増やさない
- コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける

## File Structure

| ファイル | 種別 | 役割 |
|---|---|---|
| `migrations/0014_receipt_user_id.sql` | 新規 | 列・索引の追加、既存データの埋め戻し、確認用 SQL（コメント） |
| `src/lib/db/schema.ts` | 変更 | `receipts.userId` を追加 |
| `src/lib/receipts/owner.ts` | 新規 | `ownReceiptsCondition`・`receiptOwnerFromAttendance` |
| `scripts/test-receipt-owner.mjs` | 新規 | owner.ts のテスト |
| `src/app/api/receipts/bulk/route.ts` | 変更 | 出欠・年会費の一括発行で `userId` を記録 |
| `src/app/api/receipts/route.ts` | 変更 | 手入力発行で `userId` を記録 |
| `src/app/(public)/club/[slug]/my/receipts/page.tsx` | 変更 | 一覧・件数を本人の領収書に |
| `src/app/(public)/club/[slug]/my/receipts/[receiptId]/print/page.tsx` | 変更 | 印刷を本人の領収書に |
| `src/app/(public)/club/[slug]/dashboard/page.tsx` | 変更 | トップページの領収書を本人の発行済みに |

---

### Task 1: マイグレーションとスキーマ

**Files:**
- Create: `migrations/0014_receipt_user_id.sql`
- Modify: `src/lib/db/schema.ts`（`export const receipts = pgTable('receipts', {` の中、`attendanceId` の次の行）

**Interfaces:**
- Produces: `receipts.userId`（Drizzle の列。`string | null`）。Task 2〜4 が使う

- [ ] **Step 1: マイグレーションを書く**

`migrations/0014_receipt_user_id.sql`：

```sql
-- ============================================================
-- 領収書に会員ID（user_id）を追加する（Issue #43）
--  - 会員画面（マイ領収書・会員トップページ）で本人の領収書だけを出すために使う
--  - 外部参加者の領収書など、会員がいない領収書は空のまま
--  - 既存データを埋め戻す。user_id が空の行だけを更新するので、何度実行しても問題ない
-- ============================================================

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id);

-- 1. 出欠から発行した領収書：出欠記録の会員IDを入れる（外部参加者は空のまま）
UPDATE receipts r
SET user_id = a.user_id
FROM attendances a
WHERE r.user_id IS NULL
  AND r.attendance_id = a.id
  AND a.user_id IS NOT NULL;

-- 2. 年会費の領収書：条件を満たす会員がちょうど1人のときだけ結び付ける
--    - 同じクラブの支払済み・未削除の年会費レコードがある
--    - その会員名が宛名と完全に一致する
--    - 但し書きにその年会費レコードの年度が含まれる
--    同姓同名などで候補が2人以上なら結び付けない
WITH candidates AS (
  SELECT r.id AS receipt_id, af.user_id
  FROM receipts r
  JOIN annual_fees af
    ON af.club_id = r.club_id
   AND af.payment_status = 'paid'
   AND af.deleted_at IS NULL
  JOIN users u ON u.id = af.user_id
  WHERE r.user_id IS NULL
    AND r.attendance_id IS NULL
    AND r.description LIKE '%年会費%'
    AND u.name = r.receipt_name
    AND strpos(r.description, af.fiscal_year::text) > 0
  GROUP BY r.id, af.user_id
),
unique_candidates AS (
  SELECT receipt_id, min(user_id) AS user_id
  FROM candidates
  GROUP BY receipt_id
  HAVING count(*) = 1
)
UPDATE receipts r
SET user_id = uc.user_id
FROM unique_candidates uc
WHERE r.id = uc.receipt_id
  AND r.user_id IS NULL;

-- ============================================================
-- 適用後の確認用 SQL（マイグレーションの一部ではない。必要に応じて個別に実行）
--
-- 種類別の結び付け件数:
-- SELECT CASE
--          WHEN attendance_id IS NOT NULL THEN '出欠'
--          WHEN description LIKE '%年会費%' THEN '年会費'
--          ELSE 'その他'
--        END AS kind,
--        count(*) FILTER (WHERE user_id IS NOT NULL) AS linked,
--        count(*) FILTER (WHERE user_id IS NULL)     AS unlinked
-- FROM receipts
-- WHERE deleted_at IS NULL
-- GROUP BY 1
-- ORDER BY 1;
--
-- 結び付けられなかった年会費の領収書:
-- SELECT r.club_id, r.receipt_name, r.description, r.issued_date
-- FROM receipts r
-- WHERE r.deleted_at IS NULL
--   AND r.user_id IS NULL
--   AND r.attendance_id IS NULL
--   AND r.description LIKE '%年会費%'
-- ORDER BY r.club_id, r.receipt_name;
-- ============================================================
```

- [ ] **Step 2: スキーマに列を追加する**

`src/lib/db/schema.ts` の `receipts` で、`attendanceId` の行の直後に追加：

```ts
  // 領収書の持ち主（会員）。会員画面で本人の領収書だけを出すために使う。外部参加者などは空（#43）
  userId: text('user_id').references(() => users.id),
```

- [ ] **Step 3: 型チェック**

Run: `npx --no-install tsc --noEmit -p . 2>&1 | grep -E "schema|receipts" ; echo done`
Expected: `done` だけが出る（エラーなし）

- [ ] **Step 4: コミット**

```bash
git add migrations/0014_receipt_user_id.sql src/lib/db/schema.ts
git commit -m "feat: 領収書に会員ID（user_id）を追加するマイグレーション (#43)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 本人の領収書の判定（owner.ts）とテスト

**Files:**
- Create: `src/lib/receipts/owner.ts`
- Test: `scripts/test-receipt-owner.mjs`

**Interfaces:**
- Consumes: `receipts.userId`（Task 1）
- Produces:
  - `ownReceiptsCondition(userId: string): SQL` … 本人・発行済み・未削除の条件
  - `receiptOwnerFromAttendance(attendance: { userId: string | null; meetingClubId: string | null } | null | undefined, issuingClubId: string): string | null` … 手入力発行で記録する会員ID

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-receipt-owner.mjs`：

```js
/**
 * 領収書の持ち主の判定（src/lib/receipts/owner.ts）の実コードを使ったテスト
 *
 * TypeScript を esbuild でその場で変換して読み込むため、ロジックの写しではなく本体を検証できる。
 * 実行: node scripts/test-receipt-owner.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'owner-test-'));
const out = join(dir, 'owner.mjs');
await build({
  stdin: {
    contents: "export * from './src/lib/receipts/owner'; export { PgDialect } from 'drizzle-orm/pg-core';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
const m = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const t = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : `  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
};

console.log('--- 本人の領収書の条件（ownReceiptsCondition） ---');
const q = new m.PgDialect().sqlToQuery(m.ownReceiptsCondition('user-1'));
t('会員IDで絞り込む', q.sql.includes('"receipts"."user_id" = $1'), true);
t('発行済みだけ', q.sql.includes('"receipts"."status" = $2'), true);
t('削除済みは除く', q.sql.includes('"receipts"."deleted_at" is null'), true);
t('パラメータは会員IDと issued', q.params, ['user-1', 'issued']);

console.log('--- 手入力発行の会員ID（receiptOwnerFromAttendance） ---');
t('自クラブの例会の会員の出欠 → その会員', m.receiptOwnerFromAttendance({ userId: 'u1', meetingClubId: 'A' }, 'A'), 'u1');
t('他クラブの例会の出欠 → 結び付けない', m.receiptOwnerFromAttendance({ userId: 'u1', meetingClubId: 'B' }, 'A'), null);
t('外部参加者の出欠（会員なし）→ 空', m.receiptOwnerFromAttendance({ userId: null, meetingClubId: 'A' }, 'A'), null);
t('例会のクラブが不明 → 結び付けない', m.receiptOwnerFromAttendance({ userId: 'u1', meetingClubId: null }, 'A'), null);
t('出欠記録が見つからない → 空', m.receiptOwnerFromAttendance(undefined, 'A'), null);
t('出欠記録の指定なし → 空', m.receiptOwnerFromAttendance(null, 'A'), null);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node scripts/test-receipt-owner.mjs`
Expected: FAIL（`src/lib/receipts/owner` が見つからない旨のビルドエラーで終了コード 1）

- [ ] **Step 3: 実装する**

`src/lib/receipts/owner.ts`：

```ts
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { receipts } from '@/lib/db/schema';

/**
 * 会員本人の領収書（発行済み・未削除）の条件。
 * 会員画面（マイ領収書・会員トップページ）で使う。クラブの条件は呼び出し側で併せてかける。
 */
export function ownReceiptsCondition(userId: string): SQL {
  return and(
    eq(receipts.userId, userId),
    eq(receipts.status, 'issued'),
    isNull(receipts.deletedAt),
  )!;
}

/**
 * 手入力で発行する領収書に記録する会員ID。
 * 指定された出欠記録が、発行するクラブの例会のものであるときだけ、その会員を持ち主にする
 * （他クラブの出欠記録を指定して、他人の領収書として記録されるのを防ぐ）。
 */
export function receiptOwnerFromAttendance(
  attendance: { userId: string | null; meetingClubId: string | null } | null | undefined,
  issuingClubId: string,
): string | null {
  if (!attendance?.userId) return null;
  if (attendance.meetingClubId !== issuingClubId) return null;
  return attendance.userId;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node scripts/test-receipt-owner.mjs`
Expected: `10 passed / 0 failed`

esbuild が `@/lib/db/schema` を解決できずに失敗する場合は、`build` の引数に `tsconfig: join(root, 'tsconfig.json')` を追加して再実行する。

- [ ] **Step 5: コミット**

```bash
git add src/lib/receipts/owner.ts scripts/test-receipt-owner.mjs
git commit -m "feat: 本人の領収書の条件と手入力発行の会員IDを判定する関数を追加 (#43)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 発行時に会員IDを記録する（API 3か所）

**Files:**
- Modify: `src/app/api/receipts/bulk/route.ts`（出欠モードの `db.insert(receipts).values({` と、年会費モードの `db.insert(receipts).values({`）
- Modify: `src/app/api/receipts/route.ts`（imports と POST の `db.insert(receipts).values({` の直前・中）

**Interfaces:**
- Consumes: `receipts.userId`（Task 1）、`receiptOwnerFromAttendance`（Task 2）

- [ ] **Step 1: 出欠からの一括発行で記録する**

`src/app/api/receipts/bulk/route.ts` の出欠モード（`attendanceId: att.id,` がある insert）で、`attendanceId: att.id,` の次の行に追加：

```ts
          // 会員の出欠なら持ち主として記録（外部参加者は空）。会員画面の「マイ領収書」で使う（#43）
          userId: att.userId ?? null,
```

`targetAttendances` の select には `userId: attendances.userId` がすでにあるので、取得側の変更は不要。

- [ ] **Step 2: 年会費の一括発行で記録する**

同じファイルの年会費モード（`meetingId: null,` `attendanceId: null,` がある insert）で、`attendanceId: null,` の次の行に追加：

```ts
          // 年会費の会員を持ち主として記録（#43）
          userId: fee.userId,
```

`targetFees` の select には `userId: annualFees.userId` がすでにある。

- [ ] **Step 3: 手入力の発行で記録する**

`src/app/api/receipts/route.ts` の import を変更：

```ts
import { receipts, meetings, attendances } from '@/lib/db/schema';
```

```ts
import { receiptOwnerFromAttendance } from '@/lib/receipts/owner';
```
（`import { resolveClubScope, canManageFinance } from '@/lib/auth/tenant';` の次の行に追加）

POST の `const id = randomUUID();` の直前に追加：

```ts
    // 出欠記録が指定されていれば、その会員を持ち主にする（自クラブの例会の出欠に限る。#43）
    let ownerUserId: string | null = null;
    if (attendanceId) {
      const att = await db
        .select({ userId: attendances.userId, meetingClubId: meetings.clubId })
        .from(attendances)
        .leftJoin(meetings, eq(attendances.meetingId, meetings.id))
        .where(and(eq(attendances.id, attendanceId), isNull(attendances.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      ownerUserId = receiptOwnerFromAttendance(att, resolvedClubId);
    }
```

同じ POST の `db.insert(receipts).values({` で、`attendanceId: attendanceId || null,` の次の行に追加：

```ts
      userId: ownerUserId,
```

- [ ] **Step 4: 型チェックと Lint**

Run: `npx --no-install tsc --noEmit -p . 2>&1 | grep -E "api/receipts|lib/receipts" ; echo done`
Expected: `done` だけが出る

Run:
```bash
for f in src/app/api/receipts/bulk/route.ts src/app/api/receipts/route.ts; do echo "$f main=$(git show "main:$f" | npx --no-install eslint --stdin --stdin-filename "$f" 2>&1 | grep -cE ' (error|warning) ') now=$(npx --no-install eslint "$f" 2>&1 | grep -cE ' (error|warning) ')"; done
```
Expected: 各ファイルで `now` が `main` 以下

- [ ] **Step 5: コミット**

```bash
git add src/app/api/receipts/bulk/route.ts src/app/api/receipts/route.ts
git commit -m "feat: 領収書の発行時に持ち主の会員IDを記録する (#43)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 会員画面を本人の領収書だけにする（3か所）

**Files:**
- Modify: `src/app/(public)/club/[slug]/my/receipts/page.tsx`（一覧と件数の2つの `.where(`）
- Modify: `src/app/(public)/club/[slug]/my/receipts/[receiptId]/print/page.tsx`（領収書取得の `.where(`）
- Modify: `src/app/(public)/club/[slug]/dashboard/page.tsx`（`receipts` を取得する `.where(`）

**Interfaces:**
- Consumes: `ownReceiptsCondition(userId: string): SQL`（Task 2）

- [ ] **Step 1: マイ領収書の一覧・件数**

`src/app/(public)/club/[slug]/my/receipts/page.tsx` に import を追加（drizzle-orm の import の次の行）：

```ts
import { ownReceiptsCondition } from '@/lib/receipts/owner';
```

一覧と件数の2つのクエリにある次のブロック（2か所とも同じ内容）：

```ts
        and(
          eq(receipts.clubId, profile.clubId!),
          eq(receipts.status, 'issued'),
          isNull(receipts.deletedAt)
        )
```

を、それぞれ次に置き換える：

```ts
        and(
          eq(receipts.clubId, profile.clubId!),
          // 本人の発行済み領収書だけ（#43）
          ownReceiptsCondition(profile.id),
        )
```

- [ ] **Step 2: マイ領収書の印刷**

`src/app/(public)/club/[slug]/my/receipts/[receiptId]/print/page.tsx` に import を追加：

```ts
import { ownReceiptsCondition } from '@/lib/receipts/owner';
```

次のブロック：

```ts
      and(
        eq(receipts.id, receiptId),
        eq(receipts.clubId, profile.clubId!),
        // 一覧（マイ領収書）と同じく、発行済みで削除されていないものだけ印刷できる
        eq(receipts.status, 'issued'),
        isNull(receipts.deletedAt),
      )
```

を次に置き換える：

```ts
      and(
        eq(receipts.id, receiptId),
        eq(receipts.clubId, profile.clubId!),
        // 一覧（マイ領収書）と同じく、本人の発行済み領収書だけ印刷できる（#43）。それ以外は 404
        ownReceiptsCondition(profile.id),
      )
```

`isNull` がこのファイルのほかの箇所（プロフィール取得）で使われているので import は残す。

- [ ] **Step 3: 会員トップページ**

`src/app/(public)/club/[slug]/dashboard/page.tsx` に import を追加：

```ts
import { ownReceiptsCondition } from '@/lib/receipts/owner';
```

`receipts` を取得するクエリの：

```ts
      .where(and(eq(receipts.clubId, clubId), isNull(receipts.deletedAt)))
```

を次に置き換える：

```ts
      // 本人の発行済み領収書だけ（#43。以前は自クラブの全員分・取消済みも出ていた）
      .where(and(eq(receipts.clubId, clubId), ownReceiptsCondition(profile.id)))
```

- [ ] **Step 4: 型チェックと Lint**

Run: `npx --no-install tsc --noEmit -p . 2>&1 | grep -E "club/\[slug\]|lib/receipts" ; echo done`
Expected: `done` だけが出る

Run:
```bash
for f in "src/app/(public)/club/[slug]/my/receipts/page.tsx" "src/app/(public)/club/[slug]/my/receipts/[receiptId]/print/page.tsx" "src/app/(public)/club/[slug]/dashboard/page.tsx"; do echo "$f main=$(git show "main:$f" | npx --no-install eslint --stdin --stdin-filename "$f" 2>&1 | grep -cE ' (error|warning) ') now=$(npx --no-install eslint "$f" 2>&1 | grep -cE ' (error|warning) ')"; done
```
Expected: 各ファイルで `now` が `main` 以下。未使用になった import（`isNull` など）の警告が増えていたら、その import を削除して再確認する

- [ ] **Step 5: コミット**

```bash
git add "src/app/(public)/club/[slug]/my/receipts/page.tsx" "src/app/(public)/club/[slug]/my/receipts/[receiptId]/print/page.tsx" "src/app/(public)/club/[slug]/dashboard/page.tsx"
git commit -m "fix: 会員画面の領収書を本人の発行済み領収書だけにする (#43)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 全体の確認・レビュー・PR

**Files:** なし（確認と PR 作成のみ。レビュー指摘への対応で変更が出たら、そのファイルを個別に `git add` する）

- [ ] **Step 1: テストをすべて実行**

Run: `node scripts/test-receipt-owner.mjs && node scripts/test-permissions.mjs && node scripts/test-tenant-isolation.mjs`
Expected: 3つとも `0 failed`

- [ ] **Step 2: 型チェック（全体）**

Run: `npx --no-install tsc --noEmit -p . 2>&1 | grep -E "receipts|schema|club/\[slug\]" ; echo done`
Expected: `done` だけが出る

- [ ] **Step 3: user_id を書き込む箇所の確認**

Run: `grep -rn "insert(receipts)" src`
Expected: 3か所（`bulk/route.ts` に2か所、`receipts/route.ts` に1か所）。それぞれの `values({` に `userId:` があることを目で確認する

- [ ] **Step 4: コードレビュー**

`/code-review` を実行し、指摘に対応する（プロジェクトのルール）。対応した場合は Step 1〜2 をやり直してからコミットする。

- [ ] **Step 5: push と PR 作成**

```bash
git push -u origin claude/receipt-owner
gh pr create --base main --title "会員画面の領収書を本人の分だけにする（領収書に会員IDを追加）" --body-file <(cat <<'EOF'
Closes #43

## ⚠️ マージ前に必要な作業
このPRは `receipts.user_id` 列に書き込みます。列がないDBで動くと領収書の発行がエラーになるため、次の順番を守ってください。

1. 本番の Supabase（SQL Editor）で `migrations/0014_receipt_user_id.sql` を実行する
2. ファイル末尾のコメントにある確認用 SQL で、結び付けの件数と、結び付けられなかった年会費の領収書を確認する
3. このPRをマージする（本番に自動デプロイされる）

## 概要
会員画面（マイ領収書の一覧・印刷、会員トップページ）で、同じクラブのほかの会員の領収書も見え、印刷もできていたのを修正しました。領収書に持ち主の会員ID（`user_id`）を持たせ、会員画面には本人の発行済み領収書だけを出します。

## 変更内容
- マイグレーション `0014_receipt_user_id.sql`：列と索引の追加、既存データの埋め戻し
  - 出欠から発行した領収書：出欠記録の会員
  - 年会費の領収書：同じクラブ・宛名と会員名が完全一致・その年度の年会費が支払済み、の会員が1人だけのとき
  - それ以外（同姓同名など）は空のまま。管理画面では今までどおり扱える
- 発行時に会員IDを記録（出欠からの一括発行、年会費の一括発行、手入力発行）
  - 手入力は、出欠記録が指定され、それが自クラブの例会のものであるときだけ
- 会員画面3か所を「本人・発行済み・未削除」に（会員トップページは取消済みも出ていたのを発行済みだけに）
- 判定は `src/lib/receipts/owner.ts` にまとめ、`scripts/test-receipt-owner.mjs` でテスト

## 確認
- `node scripts/test-receipt-owner.mjs` / `test-permissions.mjs` / `test-tenant-isolation.mjs`：すべて成功
- 変更ファイルに型エラーなし、Lint のエラー・警告は main から増えていない
- `/code-review` を実施し、指摘に対応済み
- マイグレーションは手元にDBがないため未実行。適用後に確認用 SQL で確認する

## 対象外
- 年会費の二重発行チェックが名前で判定している件
- 手入力の発行画面に会員を選ぶ欄を追加すること

仕様：`docs/superpowers/specs/2026-10-21-receipt-owner-design.md`
計画：`docs/superpowers/plans/2026-10-21-receipt-owner.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)
```

Expected: PR の URL が表示される。**マイグレーション適用の連絡があるまでマージしない。**
