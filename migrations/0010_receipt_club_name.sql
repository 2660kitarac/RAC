-- 領収書の宛名クラブ名（外部参加者の訪問クラブ名）
-- 印刷時に氏名とあわせてクラブ名を表示するために使用する

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS receipt_club_name TEXT;
