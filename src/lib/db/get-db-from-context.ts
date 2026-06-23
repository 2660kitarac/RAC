/**
 * Cloudflare Pages の env バインディングから D1 クライアントを取得するヘルパー
 *
 * Next.js App Router の Server Component / Server Action / Route Handler から呼ぶ。
 * @opennextjs/cloudflare が Symbol.for("__cloudflare-context__") に env を注入する。
 */
import { getDb } from './index';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export function getDbFromContext() {
  try {
    const { env } = getCloudflareContext();
    if (!env?.DB) {
      throw new Error(
        'D1 Database バインディング(DB)が見つかりません。' +
        'wrangler.jsonc の d1_databases 設定を確認してください。'
      );
    }
    return getDb(env.DB);
  } catch (e: any) {
    // getCloudflareContext が失敗した場合（SSG やビルド時など）はフォールバック
    const symbol = Symbol.for('__cloudflare-context__');
    const ctx = (globalThis as any)[symbol];
    if (ctx?.env?.DB) {
      return getDb(ctx.env.DB);
    }
    throw new Error(
      'D1 Database バインディング(DB)が見つかりません。' +
      'wrangler.jsonc の d1_databases 設定と .dev.vars を確認してください。' +
      ` (元エラー: ${e?.message})`
    );
  }
}
