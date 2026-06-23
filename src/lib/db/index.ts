/**
 * Cloudflare D1 用 Drizzle ORM クライアント
 *
 * 使い方:
 *   import { getDb } from '@/lib/db';
 *   const db = getDb(c.env.DB);  // Route Handler / Server Action の中で
 *
 * Next.js App Router では process.env ではなく Cloudflare Bindings 経由で
 * DB を受け取るため、関数形式にしています。
 */

import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type DrizzleDb = ReturnType<typeof getDb>;

/**
 * Cloudflare D1 バインディングから Drizzle インスタンスを生成する
 * @param d1 - Cloudflare D1Database バインディング（env.DB）
 */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

// スキーマ再エクスポート（インポートパスを一箇所に集約）
export * from './schema';
