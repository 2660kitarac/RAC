-- ============================================================
-- 0008: 例会終了処理（クロージング）用カラム追加
-- ============================================================
-- 例会終了時に「終了ボタン」から実行した記録を保持する。
--   finished_at           : 終了処理を実行した日時（NULL = 未終了）
--   finished_by           : 終了処理を実行したユーザーID
--   attendance_finalized  : 出席確定済みフラグ（未回答が解消された状態）
--   closing_note          : 終了時メモ（振り返り・特記事項）
--
-- status は既存の 'finished' をそのまま使用するため新規追加しない。
-- ============================================================

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS finished_at TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS finished_by TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendance_finalized BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS closing_note TEXT;

-- 既に status = 'finished' の例会は「終了済み」として整合を取る
-- （finished_at が空だと UI 上で終了済みバッジの日時が出ないため）
UPDATE meetings
   SET finished_at = COALESCE(finished_at, updated_at),
       attendance_finalized = TRUE
 WHERE status = 'finished'
   AND finished_at IS NULL;

-- 終了済み例会の絞り込み用インデックス
CREATE INDEX IF NOT EXISTS idx_meetings_status_date ON meetings(status, date);
