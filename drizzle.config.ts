import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  // Cloudflare D1 ローカル開発用
  dbCredentials: {
    url: '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/local.sqlite',
  },
});
