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
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json([
        {
          id: 'sub_existing',
          status: 'active',
          customer: { id: 'cust_1' },
          product: { id: 'prod_monthly' },
          metadata: { user_id: 'u1' },
          current_period_end: '2026-06-04T00:00:00Z',
        },
        {
          id: 'sub_missing',
          status: 'active',
          customer: { id: 'cust_2' },
          product: { id: 'prod_monthly' },
          metadata: { user_id: 'u2' },
          current_period_end: '2026-06-04T00:00:00Z',
        },
      ]),
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

  it('handles { data: [] } envelope from Creem', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        data: [
          {
            id: 'sub_x',
            status: 'active',
            customer: { id: 'cust_x' },
            product: { id: 'prod_monthly' },
            metadata: { user_id: 'u_x' },
            current_period_end: '2026-06-04T00:00:00Z',
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
    expect(result.scanned).toBe(1);
    expect(result.reconciled).toBe(1);
  });

  it('skips entries without sub.id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json([
        { status: 'active' }, // 缺 id
        {
          id: 'sub_ok',
          status: 'active',
          customer: { id: 'cust_ok' },
          product: { id: 'prod_monthly' },
          metadata: { user_id: 'u_ok' },
          current_period_end: '2026-06-04T00:00:00Z',
        },
      ]),
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
