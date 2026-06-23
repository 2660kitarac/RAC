/**
 * Supabase クライアント互換スタブ
 *
 * このファイルは Supabase → Auth.js + Cloudflare D1 移行の過渡期に使用するスタブです。
 * 各コンポーネントは /api/* エンドポイント経由に段階的に移行予定です。
 *
 * ⚠️ この実装はデータを操作しません（すべてダミーレスポンスを返します）
 */

type QueryBuilder = {
  select: (cols?: string) => QueryBuilder;
  insert: (data: unknown) => QueryBuilder;
  update: (data: unknown) => QueryBuilder;
  delete: () => QueryBuilder;
  upsert: (data: unknown) => QueryBuilder;
  eq: (col: string, val: unknown) => QueryBuilder;
  neq: (col: string, val: unknown) => QueryBuilder;
  in: (col: string, vals: unknown[]) => QueryBuilder;
  is: (col: string, val: unknown) => QueryBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => QueryBuilder;
  limit: (n: number) => QueryBuilder;
  single: () => Promise<{ data: null; error: { message: string } }>;
  then: (resolve: (result: { data: null; error: null }) => void) => Promise<void>;
};

function createQueryBuilder(): QueryBuilder {
  const stub: QueryBuilder = {
    select: () => stub,
    insert: () => stub,
    update: () => stub,
    delete: () => stub,
    upsert: () => stub,
    eq: () => stub,
    neq: () => stub,
    in: () => stub,
    is: () => stub,
    order: () => stub,
    limit: () => stub,
    single: () =>
      Promise.resolve({
        data: null,
        error: { message: 'Supabase スタブ: /api/* エンドポイントに移行してください' },
      }),
    then: (resolve) => Promise.resolve(resolve({ data: null, error: null })),
  };
  return stub;
}

export function createClient() {
  return {
    from: (_table: string) => createQueryBuilder(),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
  };
}
