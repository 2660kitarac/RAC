-- ============================================================
-- 領収書に会員ID（user_id）を追加する（Issue #43）
--  - 会員画面（マイ領収書・会員トップページ）で本人の領収書だけを出すために使う
--  - 外部参加者の領収書など、会員がいない領収書は空のまま
--  - 既存データを埋め戻す。user_id が空の行だけを更新するので、何度実行しても問題ない
--  - リリース時は「適用 → PR マージ・デプロイ完了 → もう一度適用」の順で2回実行する（適用からデプロイまでの間に旧コードが発行した領収書も結び付けるため）
-- ============================================================

BEGIN;

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id);

-- 1. 出欠から発行した領収書：出欠記録の会員IDを入れる（例会が領収書と同じクラブのものに限る。外部参加者は空のまま）
UPDATE receipts r
SET user_id = a.user_id
FROM attendances a
JOIN meetings m ON m.id = a.meeting_id
WHERE r.user_id IS NULL
  AND r.attendance_id = a.id
  AND a.user_id IS NOT NULL
  AND m.club_id = r.club_id;

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

COMMIT;

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
