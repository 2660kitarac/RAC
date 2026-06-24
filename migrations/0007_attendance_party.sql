-- ============================================================
-- 0007_attendance_party.sql
-- 懇親会機能・参加形態・定員管理の追加
-- ============================================================

-- meetings テーブル: 懇親会情報・定員追加
ALTER TABLE meetings ADD COLUMN has_after_party INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meetings ADD COLUMN after_party_venue TEXT;
ALTER TABLE meetings ADD COLUMN after_party_start_time TEXT;
ALTER TABLE meetings ADD COLUMN after_party_fee_rac INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meetings ADD COLUMN after_party_fee_rc INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meetings ADD COLUMN after_party_fee_obog INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meetings ADD COLUMN after_party_fee_guest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meetings ADD COLUMN capacity INTEGER;
ALTER TABLE meetings ADD COLUMN after_party_capacity INTEGER;

-- attendances テーブル: 参加形態追加
-- participation_type: 'meeting_only' | 'meeting_and_party' | 'absent' | 'waitlist'
ALTER TABLE attendances ADD COLUMN participation_type TEXT NOT NULL DEFAULT 'meeting_only';
ALTER TABLE attendances ADD COLUMN after_party_fee_amount INTEGER NOT NULL DEFAULT 0;
