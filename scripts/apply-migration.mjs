#!/usr/bin/env node
/**
 * マイグレーション適用スクリプト
 * 使い方: node scripts/apply-migration.mjs migrations/0008_meeting_closing.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const envPath = path.join(process.cwd(), '.env.local');
let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (m) databaseUrl = m[1].trim();
}
if (!databaseUrl) {
  console.error('DATABASE_URL が見つかりません');
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error('使い方: node scripts/apply-migration.mjs <sqlファイル>');
  process.exit(1);
}
const sqlText = fs.readFileSync(path.join(process.cwd(), file), 'utf8');

const sql = postgres(databaseUrl, { max: 1, ssl: 'require', idle_timeout: 5 });

try {
  console.log(`適用中: ${file}`);
  await sql.unsafe(sqlText);
  console.log('✅ 適用完了');

  const cols = await sql`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_name = 'meetings'
       AND column_name IN ('finished_at','finished_by','attendance_finalized','closing_note')
     ORDER BY column_name`;
  console.log('カラム確認:', cols.map((c) => `${c.column_name}(${c.data_type})`).join(', '));

  const finished = await sql`SELECT COUNT(*)::int AS c FROM meetings WHERE status = 'finished'`;
  console.log(`status='finished' の例会数: ${finished[0].c}`);
} catch (e) {
  console.error('❌ エラー:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
