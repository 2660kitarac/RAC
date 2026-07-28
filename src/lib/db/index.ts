/**
 * Supabase (PostgreSQL) 用 Drizzle ORM クライアント
 * 環境変数 DATABASE_URL から接続する
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// 環境変数チェック
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL 環境変数が設定されていません');
}

// Vercel Serverless / Supabase Pooler 向け設定 (fixes #1)
// max: 1→3 に緩和（同一インスタンス内の並行DB問い合わせ待ちを解消）
// Supabase Transaction Pooler（port 6543）使用のため prepare: false が必要
const client = postgres(connectionString, {
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,   // Transaction Pooler では prepared statement 非対応
});

export const db = drizzle(client, { schema });

export type DrizzleDb = typeof db;

// スキーマ再エクスポート
export * from './schema';
