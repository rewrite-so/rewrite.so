import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bindings } from '../types.ts';
import { reconcileSubscriptions } from './reconcile.ts';

const fakeRateLimiter = {} as unknown as DurableObjectNamespace;
const fakeKV = {} as unknown as KVNamespace;

function makeEnv(db: D1Database): Bindings {
  return {
    OPENAI_BASE_URL: 'https://upstream.test/v1',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-4o-mini',
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'http://localhost',
    RESEND_API_KEY: '',
    RESEND_FROM_EMAIL: '',
    CREEM_API_KEY: 'creem_test_key',
    CREEM_PRO_MONTHLY_PRODUCT_ID: 'prod_monthly',
    CREEM_PRO_YEARLY_PRODUCT_ID: 'prod_yearly',
    WEB_ORIGIN: 'https://rewrite.so',
    DB: db,
    KV: fakeKV,
    RATE_LIMITER: fakeRateLimiter,
  } as unknown as Bindings;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reconcileSubscriptions', () => {
  it('list failure → returns failed=1, no D1 query', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 500 }));

    const dbCalls: string[] = [];
    const stubDB = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            dbCalls.push(sql.slice(0, 30));
            return null;
          },
          run: async () => ({ success: true }),
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const result = await reconcileSubscriptions(makeEnv(stubDB));
    expect(result).toEqual({ scanned: 0, reconciled: 0, failed: 1 });
    expect(dbCalls).toEqual([]);
  });

  it('skips subscriptions already in D1; reconciles missing ones', async () => {
    const recentISO = new Date(Date.now() - 60_000).toISOString(); // 1min ago，落入 LOOKBACK 内
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        items: [
          {
            id: 'sub_existing',
            status: 'active',
            customer: { id: 'cust_1' },
            product: { id: 'prod_monthly' },
            metadata: { user_id: 'u1' },
            current_period_end: '2026-06-04T00:00:00Z',
            created_at: recentISO,
          },
          {
            id: 'sub_missing',
            status: 'active',
            customer: { id: 'cust_2' },
            product: { id: 'prod_monthly' },
            metadata: { user_id: 'u2' },
            current_period_end: '2026-06-04T00:00:00Z',
            created_at: recentISO,
          },
        ],
      }),
    );

    const inserted: string[] = [];
    const stubDB = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            // 第一个 sub 已存在，第二个不存在
            if (sql.includes('FROM subscriptions') && args[0] === 'sub_existing') {
              return { id: 'existing-row' };
            }
            return null;
          },
          run: async () => {
            if (sql.includes('INSERT INTO subscriptions')) {
              inserted.push(args[2] as string); // 第 3 位是 creem_subscription_id
            }
            return { success: true };
          },
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const result = await reconcileSubscriptions(makeEnv(stubDB));
    expect(result.scanned).toBe(2);
    expect(result.reconciled).toBe(1);
    expect(result.failed).toBe(0);
    expect(inserted).toEqual(['sub_missing']);
  });

  it('calls Creem with /v1/subscriptions/search?page_number=1&page_size=100 (not /subscriptions)', async () => {
    // Creem 列订阅 endpoint 是 /search 后缀；旧代码错用 /subscriptions（那是单查必传 subscription_id）。
    // response shape 必须是 { items: [...] }（不是 { data } 或 { subscriptions }）。
    // 来源：https://docs.creem.io/api-reference/openapi.json SubscriptionListEntity
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ items: [], pagination: {} }));

    const stubDB = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => null,
          run: async () => ({ success: true }),
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    await reconcileSubscriptions(makeEnv(stubDB));

    const calledUrl = fetchSpy.mock.calls[0]?.[0];
    expect(typeof calledUrl).toBe('string');
    expect(calledUrl).toContain('/subscriptions/search');
    expect(calledUrl).toContain('page_number=1');
    expect(calledUrl).toContain('page_size=100');
    // 防回归：旧的 created_after / 单查路径绝不能出现
    expect(calledUrl).not.toContain('created_after');
    expect(calledUrl).not.toMatch(/\/subscriptions\?/);
  });

  it('client-side filter excludes subs older than LOOKBACK_HOURS', async () => {
    // Creem /search 不支持 created_after filter，靠客户端 created_at 比对 cutoff 过滤
    const recent = new Date(Date.now() - 60_000).toISOString(); // 1min ago，应处理
    const ancient = new Date(Date.now() - 5 * 24 * 3600_000).toISOString(); // 5d ago，应跳过
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        items: [
          {
            id: 'sub_recent',
            status: 'active',
            customer: { id: 'cust_r' },
            product: { id: 'prod_monthly' },
            metadata: { user_id: 'u_r' },
            current_period_end: '2026-06-04T00:00:00Z',
            created_at: recent,
          },
          {
            id: 'sub_ancient',
            status: 'active',
            customer: { id: 'cust_a' },
            product: { id: 'prod_monthly' },
            metadata: { user_id: 'u_a' },
            current_period_end: '2026-06-04T00:00:00Z',
            created_at: ancient,
          },
        ],
      }),
    );

    const inserted: string[] = [];
    const stubDB = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => null,
          run: async () => {
            if (sql.includes('INSERT INTO subscriptions')) {
              inserted.push(args[2] as string);
            }
            return { success: true };
          },
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const result = await reconcileSubscriptions(makeEnv(stubDB));
    expect(result.scanned).toBe(1); // ancient 被过滤，scanned 不计
    expect(inserted).toEqual(['sub_recent']);
  });

  it('skips entries without sub.id', async () => {
    const recentISO = new Date(Date.now() - 60_000).toISOString();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        items: [
          { status: 'active', created_at: recentISO }, // 缺 id
          {
            id: 'sub_ok',
            status: 'active',
            customer: { id: 'cust_ok' },
            product: { id: 'prod_monthly' },
            metadata: { user_id: 'u_ok' },
            current_period_end: '2026-06-04T00:00:00Z',
            created_at: recentISO,
          },
        ],
      }),
    );

    const stubDB = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => null,
          run: async () => ({ success: true }),
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const result = await reconcileSubscriptions(makeEnv(stubDB));
    // scanned=1（只算有 id 的）；缺 id 的 entry 在 continue 之前没 ++
    expect(result.scanned).toBe(1);
    expect(result.reconciled).toBe(1);
  });
});
