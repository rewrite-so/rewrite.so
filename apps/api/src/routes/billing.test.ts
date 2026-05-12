import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 必须在 import app 之前 mock auth
let mockSession: { user: { id: string; email: string } } | null = null;

vi.mock('../lib/auth.ts', () => ({
  createAuth: () => ({
    api: { getSession: async () => mockSession },
    handler: async () => new Response('mock', { status: 200 }),
  }),
}));

const app = (await import('../index.ts')).app;

const fakeDB = {
  prepare: (_sql: string) => ({
    bind: (..._args: unknown[]) => ({
      first: async () => null,
      run: async () => ({ success: true }),
      all: async () => ({ results: [], success: true }),
    }),
  }),
} as unknown as D1Database;

const fakeRateLimiter = {
  idFromName: (_name: string) => ({}) as DurableObjectId,
  get: (_id: DurableObjectId) =>
    ({
      fetch: async () =>
        Response.json({ allowed: true, remaining: 99, retryAfterMs: 0 }, { status: 200 }),
    }) as unknown as DurableObjectStub,
} as unknown as DurableObjectNamespace;
const fakeKV = {} as unknown as KVNamespace;

const MOCK_ENV = {
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
  DB: fakeDB,
  KV: fakeKV,
  RATE_LIMITER: fakeRateLimiter,
} as const;

beforeEach(() => {
  mockSession = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /v1/billing/verify-checkout', () => {
  it('returns 401 when not signed in', async () => {
    mockSession = null;
    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_123' }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing checkoutId', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(400);
  });

  it('calls Creem with /v1/checkouts?checkout_id=... query-param URL (not path-param)', async () => {
    // Creem OpenAPI: GET /v1/checkouts?checkout_id=xxx；写成 path param 一律 404。
    // 来源 https://docs.creem.io/api-reference/openapi.json operationId=retrieveCheckout
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ id: 'ck_abc', status: 'pending', metadata: { user_id: 'u1' } }),
      );
    await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_abc' }),
      },
      MOCK_ENV,
    );
    const calledUrl = fetchSpy.mock.calls[0]?.[0];
    expect(typeof calledUrl).toBe('string');
    expect(calledUrl).toContain('/checkouts?');
    expect(calledUrl).toContain('checkout_id=ck_abc');
    // 防回归：path-param 形态绝不能出现
    expect(calledUrl).not.toMatch(/\/checkouts\/ck_abc/);
  });

  it('returns 502 when Creem fetch fails', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_123' }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(502);
  });

  it('returns 403 when checkout metadata.user_id does not match session user', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        id: 'ck_123',
        status: 'completed',
        metadata: { user_id: 'OTHER_USER' },
        subscription: {},
      }),
    );
    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_123' }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('user_mismatch');
  });

  it('checkout still pending → applied=false, no DB write', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        id: 'ck_123',
        status: 'pending',
        metadata: { user_id: 'u1' },
      }),
    );
    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_123' }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'pending', applied: false });
  });

  it('completed checkout with subscription object → upserts to DB and returns applied=true', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        id: 'ck_123',
        status: 'completed',
        metadata: { user_id: 'u1' },
        subscription: {
          id: 'sub_456',
          status: 'active',
          customer: { id: 'cust_789' },
          product: { id: 'prod_monthly' },
          current_period_start: '2026-05-04T00:00:00Z',
          current_period_end: '2026-06-04T00:00:00Z',
          metadata: { user_id: 'u1' },
        },
      }),
    );

    const writes: string[] = [];
    const stubDB = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => null, // 不存在 → INSERT 路径
          run: async () => {
            if (sql.includes('INSERT INTO subscriptions')) writes.push('insert');
            else if (sql.includes('UPDATE subscriptions')) writes.push('update');
            return { success: true };
          },
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    // Record events so we can assert verify-checkout emits the same
    // subscription_paid signal a webhook-driven activation would.
    const eventsWritten: Array<{ indexes: string[]; blobs: string[]; doubles: number[] }> = [];
    const EVENTS = {
      writeDataPoint: (p: { indexes: string[]; blobs: string[]; doubles: number[] }) => {
        eventsWritten.push(p);
      },
    } as unknown as AnalyticsEngineDataset;

    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_123' }),
      },
      { ...MOCK_ENV, DB: stubDB, EVENTS },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'completed', applied: true });
    expect(writes).toEqual(['insert']);
    // verify-checkout must emit subscription_paid so the funnel sees this
    // even when the webhook arrives late or fails entirely.
    expect(eventsWritten).toHaveLength(1);
    expect(eventsWritten[0]?.indexes).toEqual(['subscription_paid']);
    expect(eventsWritten[0]?.blobs[12]).toContain('"plan":"monthly"');
  });

  it('EVENTS_DISABLED=1 suppresses subscription_paid emission from verify-checkout', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        id: 'ck_123',
        status: 'completed',
        metadata: { user_id: 'u1' },
        subscription: {
          id: 'sub_456',
          status: 'active',
          customer: { id: 'cust_789' },
          product: { id: 'prod_monthly' },
          current_period_start: '2026-05-04T00:00:00Z',
          current_period_end: '2026-06-04T00:00:00Z',
          metadata: { user_id: 'u1' },
        },
      }),
    );

    const stubDB = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          run: async () => ({ success: true }),
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;
    const eventsWritten: unknown[] = [];
    const EVENTS = {
      writeDataPoint: (p: unknown) => {
        eventsWritten.push(p);
      },
    } as unknown as AnalyticsEngineDataset;

    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_123' }),
      },
      { ...MOCK_ENV, DB: stubDB, EVENTS, EVENTS_DISABLED: '1' },
    );
    expect(res.status).toBe(200);
    expect(eventsWritten).toHaveLength(0);
  });

  it('completed checkout but subscription object missing required fields → applied=false', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        id: 'ck_123',
        status: 'completed',
        metadata: { user_id: 'u1' },
        // sub object 缺 customer / product / id
        subscription: { status: 'active', metadata: { user_id: 'u1' } },
      }),
    );
    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_123' }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
    // 字段不齐没真的写入 DB —— 不能骗客户端 applied=true，让 webhook 兜底
    expect(await res.json()).toMatchObject({ status: 'completed', applied: false });
  });

  it('completed checkout with subscription as string id → fetchSubscription fills in object, applied=true', async () => {
    // CheckoutEntity.subscription is oneOf [string, SubscriptionEntity]; when it
    // arrives as a bare id, verify-checkout must call retrieveSubscription before
    // upserting. Source: docs.creem.io/api-reference/openapi.json CheckoutEntity.subscription
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        // 1st call: GET /checkouts (verify) — sub 是 string id
        Response.json({
          id: 'ck_123',
          status: 'completed',
          metadata: { user_id: 'u1' },
          subscription: 'sub_456',
        }),
      )
      .mockResolvedValueOnce(
        // 2nd call: GET /subscriptions?subscription_id=sub_456 — 拿到完整 object
        Response.json({
          id: 'sub_456',
          status: 'active',
          customer: { id: 'cust_789' },
          product: { id: 'prod_monthly' },
          current_period_start_date: '2026-05-04T00:00:00Z',
          current_period_end_date: '2026-06-04T00:00:00Z',
          metadata: { user_id: 'u1' },
        }),
      );

    const writes: string[] = [];
    const stubDB = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => null,
          run: async () => {
            if (sql.includes('INSERT INTO subscriptions')) writes.push('insert');
            return { success: true };
          },
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_123' }),
      },
      { ...MOCK_ENV, DB: stubDB },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'completed', applied: true });
    expect(writes).toEqual(['insert']);
    // 第二次 fetch 必须打到 retrieveSubscription endpoint
    const secondCallUrl = fetchSpy.mock.calls[1]?.[0];
    expect(typeof secondCallUrl).toBe('string');
    expect(secondCallUrl).toContain('/subscriptions?');
    expect(secondCallUrl).toContain('subscription_id=sub_456');
  });

  it('completed checkout with inline subscription object → no fetchSubscription call (spy assertion)', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        id: 'ck_123',
        status: 'completed',
        metadata: { user_id: 'u1' },
        subscription: {
          id: 'sub_456',
          status: 'active',
          customer: { id: 'cust_789' },
          product: { id: 'prod_monthly' },
          current_period_start_date: '2026-05-04T00:00:00Z',
          current_period_end_date: '2026-06-04T00:00:00Z',
          metadata: { user_id: 'u1' },
        },
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

    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_123' }),
      },
      { ...MOCK_ENV, DB: stubDB },
    );
    expect(res.status).toBe(200);
    // 仅 1 次 fetch（GET /checkouts），不应额外调 retrieveSubscription
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fetchSubscription throws → 502, no DB write', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          id: 'ck_123',
          status: 'completed',
          metadata: { user_id: 'u1' },
          subscription: 'sub_456',
        }),
      )
      .mockResolvedValueOnce(new Response('upstream gone', { status: 500 }));

    const writes: string[] = [];
    const stubDB = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => null,
          run: async () => {
            if (sql.includes('INSERT INTO subscriptions')) writes.push('insert');
            return { success: true };
          },
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const res = await app.request(
      '/v1/billing/verify-checkout',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutId: 'ck_123' }),
      },
      { ...MOCK_ENV, DB: stubDB },
    );
    expect(res.status).toBe(502);
    expect(writes).toEqual([]);
  });
});
