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

// Vercel Serverless / Supabase Pooler 向け設定
const client = postgres(connectionString, {
  max: 1,           // Serverless では接続数を絞る
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

export type DrizzleDb = typeof db;

// スキーマ再エクスポート
export * from './schema';
