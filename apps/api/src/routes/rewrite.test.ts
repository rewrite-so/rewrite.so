import { parseSSEStream, type SSEEvent } from '@rewrite/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthState = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
}));

// 必须在 import app 之前 mock auth，避免 better-auth 在测试环境下查 D1
vi.mock('../lib/auth.ts', () => ({
  createAuth: () => ({
    api: { getSession: async () => mockAuthState.session },
    handler: async () => new Response('mock', { status: 200 }),
  }),
}));

vi.mock('../lib/crypto.ts', () => ({
  decryptApiKey: async () => 'sk-byok',
}));

const app = (await import('../index.ts')).app;

// Fake D1：所有 SELECT 返 null，UPSERT no-op
const fakeDB = {
  prepare: (_sql: string) => ({
    bind: (..._args: unknown[]) => ({
      first: async () => null,
      run: async () => ({ success: true }),
      all: async () => ({ results: [], success: true }),
    }),
  }),
} as unknown as D1Database;

// Fake DurableObjectNamespace：所有 consume 返 allowed=true
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
  BYOK_MASTER_KEY: 'test-master-key',
  BETTER_AUTH_SECRET: 'test-secret',
  BETTER_AUTH_URL: 'http://localhost',
  RESEND_API_KEY: '',
  RESEND_FROM_EMAIL: '',
  TURNSTILE_SECRET: '',
  EXTENSION_INSTALL_URL: 'https://github.com/rewrite-so/rewrite.so/releases/latest',
  DB: fakeDB,
  KV: fakeKV,
  RATE_LIMITER: fakeRateLimiter,
} as const;

function makeUpstreamSSE(text: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      // 一帧一字符的流式
      for (const ch of text) {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`),
        );
      }
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /v1/rewrite', () => {
  beforeEach(() => {
    mockAuthState.session = null;
    // 默认 mock：每路返回不同文本
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const txts = ['Hello.', 'Hey!', 'Greetings.'];
      const t = txts[callCount % txts.length] ?? '';
      callCount++;
      return makeUpstreamSSE(t);
    });
  });

  it('returns SSE stream with meta + 3 done + end', async () => {
    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: ['faithful', 'casual', 'formal'],
        }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    if (!res.body) throw new Error('expected body');
    const events: SSEEvent[] = [];
    for await (const ev of parseSSEStream(res.body)) events.push(ev);

    expect(events[0]?.event).toBe('meta');
    expect(events.at(-1)?.event).toBe('end');
    expect(events.filter((e) => e.event === 'done')).toHaveLength(3);
  });

  it('rejects empty text with 400', async () => {
    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: '',
          hasSelection: false,
          lang: 'en',
          styles: ['faithful', 'casual', 'formal'],
        }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(400);
  });

  it('rejects > 4000 chars with 413', async () => {
    const long = 'a'.repeat(4001);
    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: long,
          hasSelection: false,
          lang: 'en',
          styles: ['faithful', 'casual', 'formal'],
        }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'input_too_long', limit: 4000 });
  });

  it('returns 503 when upstream not configured', async () => {
    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: ['faithful', 'casual', 'formal'],
        }),
      },
      { ...MOCK_ENV, OPENAI_BASE_URL: '', OPENAI_API_KEY: '', OPENAI_MODEL: '' },
    );
    expect(res.status).toBe(503);
  });

  it('returns 400 on invalid JSON', async () => {
    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(400);
  });

  it('single-style request fans out only one upstream stream', async () => {
    let upstreamCallCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      upstreamCallCount++;
      return makeUpstreamSSE('regenerated');
    });

    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: ['casual'],
        }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    if (!res.body) throw new Error('expected body');
    const events: SSEEvent[] = [];
    for await (const ev of parseSSEStream(res.body)) events.push(ev);

    expect(upstreamCallCount).toBe(1);
    const dones = events.filter((e) => e.event === 'done');
    expect(dones).toHaveLength(1);
    expect((dones[0] as { data: { style: string } }).data.style).toBe('casual');
    // meta event 的 streams 字段也应该只列单 style
    const meta = events[0] as { event: 'meta'; data: { streams: string[] } };
    expect(meta.event).toBe('meta');
    expect(meta.data.streams).toEqual(['casual']);
  });

  it('rejects empty styles array (min 1)', async () => {
    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: [],
        }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(400);
  });

  it('meta event omits userTargetLang for anonymous user (no DB pref)', async () => {
    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: ['faithful'],
        }),
      },
      MOCK_ENV,
    );
    if (!res.body) throw new Error('expected body');
    const events: SSEEvent[] = [];
    for await (const ev of parseSSEStream(res.body)) events.push(ev);
    const meta = events[0] as Extract<SSEEvent, { event: 'meta' }>;
    expect(meta.data.status?.userTargetLang).toBeUndefined();
  });

  it('meta event includes status payload (anonymous: authed=false)', async () => {
    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: ['faithful', 'casual', 'formal'],
        }),
      },
      MOCK_ENV,
    );

    if (!res.body) throw new Error('expected body');
    const events: SSEEvent[] = [];
    for await (const ev of parseSSEStream(res.body)) events.push(ev);

    const meta = events[0] as Extract<SSEEvent, { event: 'meta' }>;
    expect(meta.event).toBe('meta');
    expect(meta.data.status).toBeDefined();
    expect(meta.data.status?.authed).toBe(false);
    // 没传 installId → IP 维度匿名
    expect(meta.data.status?.tier).toBe('anonymous_ip');
    expect(meta.data.status?.isBYOK).toBe(false);
    // anonymous_ip 配额 10/月，第一次请求 used=1
    expect(meta.data.status?.used).toBe(1);
    expect(meta.data.status?.limit).toBe(10);
  });

  it('429 quota_exceeded body includes authed/tier for client CTA routing', async () => {
    // mock D1 SELECT 返回 count=10（达 anonymous_ip 上限）
    const exhaustedDB = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => ({ count: 10 }),
          run: async () => ({ success: true }),
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: ['faithful', 'casual', 'formal'],
        }),
      },
      { ...MOCK_ENV, DB: exhaustedDB },
    );

    expect(res.status).toBe(429);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: 'quota_exceeded',
      authed: false,
      tier: 'anonymous_ip',
    });
  });

  it('uses BYOK user burst bucket and skips monthly hosted-model quota', async () => {
    mockAuthState.session = { user: { id: 'user-free' } };
    let capturedBucket: Record<string, unknown> | null = null;

    const byokDB = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (sql.includes('FROM byok_keys')) {
              return {
                base_url: 'https://byok-provider.test/v1',
                model: 'custom-model',
                encrypted_api_key: 'encrypted',
                iv: 'iv',
              };
            }
            return null;
          },
          run: async () => ({ success: true }),
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const capturingRateLimiter = {
      idFromName: (name: string) => {
        expect(name).toBe('user:user-free');
        return {} as DurableObjectId;
      },
      get: (_id: DurableObjectId) =>
        ({
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            capturedBucket = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
            return Response.json(
              { allowed: true, remaining: 99, retryAfterMs: 0 },
              { status: 200 },
            );
          },
        }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace;

    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: ['faithful'],
        }),
      },
      { ...MOCK_ENV, DB: byokDB, RATE_LIMITER: capturingRateLimiter },
    );

    expect(res.status).toBe(200);
    expect(capturedBucket).toMatchObject({ cost: 1, capacity: 100, refillPerSec: 100 / 60 });

    if (!res.body) throw new Error('expected body');
    const events: SSEEvent[] = [];
    for await (const ev of parseSSEStream(res.body)) events.push(ev);
    const meta = events[0] as Extract<SSEEvent, { event: 'meta' }>;
    expect(meta.data.status?.authed).toBe(true);
    expect(meta.data.status?.tier).toBe('free');
    expect(meta.data.status?.isBYOK).toBe(true);
    expect(meta.data.status?.used).toBeUndefined();
    expect(meta.data.status?.limit).toBeUndefined();
  });

  it('requires Turnstile token for anonymous web requests when secret is configured', async () => {
    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: ['faithful'],
        }),
      },
      { ...MOCK_ENV, TURNSTILE_SECRET: 'turnstile-secret' },
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'turnstile_failed' });
  });

  it('accepts valid Turnstile token for anonymous web requests', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('siteverify')) {
        return Response.json({ success: true });
      }
      return makeUpstreamSSE('ok');
    });

    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: ['faithful'],
          turnstileToken: 'token-ok',
        }),
      },
      { ...MOCK_ENV, TURNSTILE_SECRET: 'turnstile-secret' },
    );

    expect(res.status).toBe(200);
  });

  it('one upstream fails, the other two still complete', async () => {
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      n++;
      if (n === 2) return new Response('rate limited', { status: 429 });
      return makeUpstreamSSE('ok');
    });

    const res = await app.request(
      '/v1/rewrite',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hi',
          hasSelection: false,
          lang: 'en',
          styles: ['faithful', 'casual', 'formal'],
        }),
      },
      MOCK_ENV,
    );

    if (!res.body) throw new Error('expected body');
    const events: SSEEvent[] = [];
    for await (const ev of parseSSEStream(res.body)) events.push(ev);

    const dones = events.filter((e) => e.event === 'done');
    const errors = events.filter((e) => e.event === 'error');
    expect(dones.length).toBe(2);
    expect(errors.length).toBe(1);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.request('/health', {}, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, service: 'rewrite-api' });
  });
});
