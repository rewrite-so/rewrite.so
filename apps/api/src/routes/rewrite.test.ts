import { parseSSEStream, type SSEEvent } from '@rewrite/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 必须在 import app 之前 mock auth，避免 better-auth 在测试环境下查 D1
vi.mock('../lib/auth.ts', () => ({
  createAuth: () => ({
    api: { getSession: async () => null },
    handler: async () => new Response('mock', { status: 200 }),
  }),
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
  BETTER_AUTH_SECRET: 'test-secret',
  BETTER_AUTH_URL: 'http://localhost',
  RESEND_API_KEY: '',
  RESEND_FROM_EMAIL: '',
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
