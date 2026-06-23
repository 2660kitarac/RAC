/**
 * Cloudflare Pages の env バインディングから D1 クライアントを取得するヘルパー
 *
 * Next.js App Router の Server Component / Server Action / Route Handler から呼ぶ。
 * @opennextjs/cloudflare が Symbol.for("__cloudflare-context__") に env を注入する。
 *
 * 実装方針:
 * 1. まず globalThis の Symbol から直接取得（本番 CF Workers では確実に存在）
 * 2. 失敗した場合のみ getCloudflareContext({ async: true }) を試行
 */
import { getDb } from './index';

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for('__cloudflare-context__');

export async function getDbFromContext() {
  // 方法1: globalThis から直接取得（Cloudflare Workers 本番環境で最も確実）
  const ctxDirect = (globalThis as any)[CLOUDFLARE_CONTEXT_SYMBOL];
  if (ctxDirect?.env?.DB) {
    return getDb(ctxDirect.env.DB);
  }

  // 方法2: getCloudflareContext({ async: true }) で取得を試みる
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    if (env?.DB) {
      return getDb(env.DB);
    }
    throw new Error(
      'D1 Database バインディング(DB)が見つかりません。' +
      'wrangler.jsonc の d1_databases 設定を確認してください。'
    );
  } catch (e: any) {
    // getCloudflareContext 失敗後に再度 globalThis を確認（非同期で設定された場合）
    const ctxRetry = (globalThis as any)[CLOUDFLARE_CONTEXT_SYMBOL];
    if (ctxRetry?.env?.DB) {
      return getDb(ctxRetry.env.DB);
    }
    throw new Error(
      'D1 Database バインディング(DB)が見つかりません。' +
      'wrangler.jsonc の d1_databases 設定と .dev.vars を確認してください。' +
      ` (元エラー: ${e?.message})`
    );
  }
}
