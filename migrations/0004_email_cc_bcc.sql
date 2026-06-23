-- RAC Cloud D1 Migration: 0004_email_cc_bcc
-- emails テーブルに CC/BCC カラム追加

ALTER TABLE emails ADD COLUMN cc_emails TEXT;
ALTER TABLE emails ADD COLUMN bcc_emails TEXT;
ALTER TABLE emails ADD COLUMN reply_to TEXT;
