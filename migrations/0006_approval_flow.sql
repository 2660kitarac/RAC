-- 0006: 会員承認フロー・ロール簡素化対応
-- users に status カラム追加（pending=承認待ち / active=承認済み / rejected=却下）
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- 既存の全ユーザーは active にする（既に利用中のため）
UPDATE users SET status = 'active' WHERE status IS NULL OR status = '';
