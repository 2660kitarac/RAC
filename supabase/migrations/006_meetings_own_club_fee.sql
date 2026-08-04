-- 自クラブ会員の登録料設定カラムを meetings テーブルに追加
-- null = 0円（デフォルト）、数値 = その例会での自クラブ会員登録料
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS own_club_fee integer;
