-- ============================================================
-- 0010: 締切後の遅延登録に対応
-- ============================================================
-- 目的:
--   例会の登録締切を過ぎた後も出席登録を受け付けられるようにする。
--   締切そのものは残し、締切後の登録は「遅延登録」としてフラグを立てて
--   運営が識別できるようにする。
--
-- deadline_policy の値:
--   'flexible'    : 締切後も登録可（食事も含めて受付） ← 既定
--   'meal_strict' : 締切後も登録可だが食事は締切までのみ
--   'strict'      : 締切後は登録不可（従来の挙動）
-- ============================================================

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS deadline_policy TEXT NOT NULL DEFAULT 'flexible';

-- 既存レコードも柔軟モードに（ユーザー承認済み）
UPDATE meetings
   SET deadline_policy = 'flexible'
 WHERE deadline_policy IS NULL
    OR deadline_policy NOT IN ('flexible', 'meal_strict', 'strict');

ALTER TABLE attendances
  ADD COLUMN IF NOT EXISTS is_late_registration BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE attendances
  ADD COLUMN IF NOT EXISTS registered_after_deadline_days INTEGER;

CREATE INDEX IF NOT EXISTS idx_attendances_late
  ON attendances(meeting_id, is_late_registration);
