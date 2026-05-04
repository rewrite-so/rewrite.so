import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 必须在 import app 之前 mock auth；mockSession 用 setter 控制每个用例的登录态
let mockSession: { user: { id: string; email: string } } | null = null;

vi.mock('../lib/auth.ts', () => ({
  createAuth: () => ({
    api: {
      getSession: async () => mockSession,
    },
    handler: async () => new Response('mock', { status: 200 }),
  }),
}));

// resolveUserTier 由测试 case 控制返回（默认 'free'）
let mockTier: 'free' | 'pro' = 'free';

vi.mock('../lib/quota.ts', async () => {
  const actual = await vi.importActual<typeof import('../lib/quota.ts')>('../lib/quota.ts');
  return {
    ...actual,
    resolveUserTier: async () => mockTier,
  };
});

// crypto: encryptApiKey 真跑会要求 BYOK_MASTER_KEY 是真 32 byte AES-GCM key；mock 简化
vi.mock('../lib/crypto.ts', () => ({
  encryptApiKey: async (apiKey: string) => ({
    encrypted: 'enc_' + apiKey,
    iv: 'iv_x',
    mask: apiKey.slice(-4),
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

// Fake DurableObjectNamespace：默认所有 consume 返 allowed=true，
// 测试 rate-limit case 时可临时 override
let rateLimiterAllowed = true;
const fakeRateLimiter = {
  idFromName: (_name: string) => ({}) as DurableObjectId,
  get: (_id: DurableObjectId) =>
    ({
      fetch: async () =>
        Response.json(
          { allowed: rateLimiterAllowed, remaining: 99, retryAfterMs: 0 },
          { status: 200 },
        ),
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
  BYOK_MASTER_KEY: 'dGVzdC1tYXN0ZXIta2V5LTMyLWJ5dGVzLWFhYWFhYWFhYWE=',
  DB: fakeDB,
  KV: fakeKV,
  RATE_LIMITER: fakeRateLimiter,
} as const;

beforeEach(() => {
  mockSession = null;
  mockTier = 'free';
  rateLimiterAllowed = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PUT /v1/me/byok (Pro gate removed)', () => {
  const validBody = {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'sk-1234567890abcdef',
  };

  it('returns 401 when not signed in', async () => {
    const res = await app.request(
      '/v1/me/byok',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 for signed-in Free user (was 403 before BYOK unlock)', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    mockTier = 'free';
    const res = await app.request(
      '/v1/me/byok',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean };
    expect(body.configured).toBe(true);
  });

  it('returns 200 for signed-in Pro user (still works)', async () => {
    mockSession = { user: { id: 'u_pro', email: 'pro@test.com' } };
    mockTier = 'pro';
    const res = await app.request(
      '/v1/me/byok',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 for missing fields', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    const res = await app.request(
      '/v1/me/byok',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseUrl: 'https://x.com' }), // 缺 model / apiKey
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /v1/me/byok', () => {
  it('returns 401 when not signed in', async () => {
    const res = await app.request('/v1/me/byok', { method: 'DELETE' }, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  it('returns 200 for signed-in user (any tier)', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    const res = await app.request('/v1/me/byok', { method: 'DELETE' }, MOCK_ENV);
    expect(res.status).toBe(200);
  });
});

describe('POST /v1/me/byok/test', () => {
  const validBody = {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'sk-1234567890abcdef',
  };

  it('returns 401 when not signed in', async () => {
    const res = await app.request(
      '/v1/me/byok/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(401);
  });

  it('returns ok=true with latencyMs when upstream returns 200', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{}', { status: 200 }),
    );

    const res = await app.request(
      '/v1/me/byok/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; latencyMs: number };
    expect(body.ok).toBe(true);
    expect(typeof body.latencyMs).toBe('number');
  });

  it('returns error=unauthorized when upstream 401', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{}', { status: 401 }),
    );

    const res = await app.request(
      '/v1/me/byok/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unauthorized');
  });

  it('returns error=model_not_found when upstream 404', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{}', { status: 404 }),
    );

    const res = await app.request(
      '/v1/me/byok/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe('model_not_found');
  });

  it('returns error=rate_limited when upstream 429', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{}', { status: 429 }),
    );

    const res = await app.request(
      '/v1/me/byok/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe('rate_limited');
  });

  it('returns error=unreachable when fetch throws', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });

    const res = await app.request(
      '/v1/me/byok/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unreachable');
  });

  it('returns 400 for missing fields', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    const res = await app.request(
      '/v1/me/byok/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseUrl: 'https://x.com' }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate-limited (10 req/min/user)', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    rateLimiterAllowed = false;
    const res = await app.request(
      '/v1/me/byok/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('rate_limit');
  });

  it('returns error=invalid_base_url when baseUrl includes /chat/completions', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    const res = await app.request(
      '/v1/me/byok/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...validBody,
          baseUrl: 'https://api.openai.com/v1/chat/completions',
        }),
      },
      MOCK_ENV,
    );
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_base_url');
  });

  it('returns error=timeout when fetch is aborted by 8s timer', async () => {
    mockSession = { user: { id: 'u_free', email: 'free@test.com' } };
    // mock fetch 让它响应 AbortSignal 抛 AbortError —— 模拟超时被 controller.abort() 触发
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      return new Promise<Response>((_, reject) => {
        signal?.addEventListener('abort', () => {
          const err = new DOMException('aborted', 'AbortError');
          reject(err);
        });
      });
    });

    vi.useFakeTimers();
    const promise = app.request(
      '/v1/me/byok/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      MOCK_ENV,
    );
    // 推进时钟越过 8s timeout，触发 controller.abort()
    await vi.advanceTimersByTimeAsync(8001);
    const res = await promise;
    vi.useRealTimers();

    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('timeout');
  });
});

describe('POST /v1/me/claim-install', () => {
  it('returns 401 when not signed in', async () => {
    mockSession = null;
    const res = await app.request(
      '/v1/me/claim-install',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installId: 'install-abc-123-def' }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing installId', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    const res = await app.request(
      '/v1/me/claim-install',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(400);
  });

  it('first call merges install count to user; idempotent second call no-op', async () => {
    mockSession = { user: { id: 'user_abc', email: 'u@test.com' } };

    // 模拟：install 行 count=4；usage_claims 第一次 INSERT 成功（changes=1）；
    // 第二次 INSERT IGNORE 不写入（changes=0）
    let claimAttempt = 0;
    const callLog: string[] = [];
    const stubDB = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (sql.includes('FROM usage_monthly')) {
              callLog.push('select_install');
              return { count: 4 };
            }
            return null;
          },
          run: async () => {
            if (sql.includes('INSERT OR IGNORE INTO usage_claims')) {
              claimAttempt++;
              callLog.push(`claim_${claimAttempt}`);
              return { success: true, meta: { changes: claimAttempt === 1 ? 1 : 0 } };
            }
            if (sql.includes('INSERT INTO usage_monthly')) {
              callLog.push('upsert_user');
            }
            return { success: true };
          },
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    // 第一次：merged=4
    const res1 = await app.request(
      '/v1/me/claim-install',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installId: 'install-abc-123-def' }),
      },
      { ...MOCK_ENV, DB: stubDB },
    );
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ merged: 4, applied: true });

    // 第二次：merged=0, applied=false（PK 重放保护）
    const res2 = await app.request(
      '/v1/me/claim-install',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installId: 'install-abc-123-def' }),
      },
      { ...MOCK_ENV, DB: stubDB },
    );
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ merged: 0, applied: false });

    // 验证第二次没碰 user 维度的 upsert
    expect(callLog).toEqual([
      'select_install',
      'claim_1',
      'upsert_user',
      'select_install',
      'claim_2',
    ]);
  });

  it('returns 429 when rate-limit bucket exhausted', async () => {
    mockSession = { user: { id: 'u1', email: 'u1@test.com' } };
    rateLimiterAllowed = false;
    const res = await app.request(
      '/v1/me/claim-install',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installId: 'install-abc-123-def' }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe('rate_limit');
    rateLimiterAllowed = true;
  });

  it('install count=0 still records claim but does not upsert user row', async () => {
    mockSession = { user: { id: 'user_abc', email: 'u@test.com' } };

    const callLog: string[] = [];
    const stubDB = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (sql.includes('FROM usage_monthly')) return null; // install 行不存在
            return null;
          },
          run: async () => {
            if (sql.includes('INSERT OR IGNORE INTO usage_claims')) {
              callLog.push('claim');
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes('INSERT INTO usage_monthly')) {
              callLog.push('upsert_user');
            }
            return { success: true };
          },
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const res = await app.request(
      '/v1/me/claim-install',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installId: 'install-fresh-no-history' }),
      },
      { ...MOCK_ENV, DB: stubDB },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ merged: 0, applied: true });
    // 0 count 不必动 user 行
    expect(callLog).toEqual(['claim']);
  });
});
