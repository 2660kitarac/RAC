-- RAC Cloud - 初期シードデータ
-- 大阪北RACクラブ用の初期データ
-- 
-- 【重要】パスワードハッシュの生成方法:
-- Node.js で以下を実行:
--   node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('your-password',12).then(h=>console.log(h))"
-- 生成されたハッシュを password_hash に設定する
--
-- 以下は "password123" のサンプルハッシュ（本番では必ず変更すること）

-- ============================================================
-- クラブデータ
-- ============================================================
INSERT OR IGNORE INTO clubs (id, name, short_name, slug, type, district, area, is_active)
VALUES (
  'club-osaka-kita-001',
  'ローターアクトクラブ大阪北',
  '大阪北RAC',
  'osaka-kita',
  'RAC',
  '2660地区',
  '大阪',
  1
);

-- ============================================================
-- 管理者ユーザー（パスワード変更必須）
-- password_hash は "changeme123" のbcryptハッシュ例
-- 本番運用前に必ずパスワードを変更すること
-- ============================================================
INSERT OR IGNORE INTO users (
  id, club_id, name, email, password_hash, role, member_type, is_active
) VALUES (
  'user-admin-001',
  'club-osaka-kita-001',
  '管理者',
  'admin@osaka-kita-rac.jp',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBAQCFVAqdFqIm',
  'club_admin',
  'RAC',
  1
);

-- ============================================================
-- メール送信テンプレート（初期値）
-- ============================================================
INSERT OR IGNORE INTO email_templates (
  id, club_id, name, template_type, subject_template, body_template, is_default
) VALUES
(
  'tmpl-invitation-001',
  'club-osaka-kita-001',
  '例会案内（標準）',
  'meeting_invitation',
  '【{{club_name}}】{{meeting_title}} のご案内',
  '{{member_name}} 様

{{club_name}} より、例会のご案内をお送りします。

■ 例会名: {{meeting_title}}
■ 日時: {{meeting_date}} {{meeting_time}}
■ 会場: {{venue_name}}
■ 参加費: {{fee_amount}}円

ご参加をお待ちしております。

{{club_name}}',
  1
),
(
  'tmpl-reminder-001',
  'club-osaka-kita-001',
  'リマインダー（標準）',
  'reminder',
  '【リマインダー】{{meeting_title}} は明日開催です',
  '{{member_name}} 様

明日の例会についてご連絡します。

■ 例会名: {{meeting_title}}
■ 日時: {{meeting_date}} {{meeting_time}}
■ 会場: {{venue_name}}

皆様のご参加をお待ちしております。

{{club_name}}',
  1
);
