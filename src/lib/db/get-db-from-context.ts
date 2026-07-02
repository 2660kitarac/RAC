/**
 * 後方互換ラッパー
 * 旧: Cloudflare D1 バインディングから取得
 * 新: 環境変数 DATABASE_URL ベースの共有 db インスタンスを返す
 */
export { db as getDbInstance } from './index';

import { db } from './index';

export async function getDbFromContext() {
  return db;
}
