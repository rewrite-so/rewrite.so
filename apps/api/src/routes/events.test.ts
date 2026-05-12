import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockSession: { user: { id: string; email: string } } | null = null;

vi.mock('../lib/auth.ts', () => ({
  createAuth: () => ({
    api: {
      getSession: async () => mockSession,
    },
    handler: async () => new Response('mock', { status: 200 }),
  }),
}));

let mockTier: 'free' | 'pro' = 'free';

vi.mock('../lib/quota.ts', async () => {
  const actual = await vi.importActual<typeof import('../lib/quota.ts')>('../lib/quota.ts');
  return {
    ...actual,
    resolveUserTier: async () => mockTier,
  };
});

const app = (await import('../index.ts')).app;

const fakeDB = {
  prepare: () => ({
    bind: () => ({
      first: async () => null,
      run: async () => ({ success: true }),
      all: async () => ({ results: [], success: true }),
    }),
  }),
} as unknown as D1Database;

let rateLimiterAllowed = true;
const fakeRateLimiter = {
  idFromName: () => ({}) as DurableObjectId,
  get: () =>
    ({
      fetch: async () =>
        Response.json(
          { allowed: rateLimiterAllowed, remaining: 29, retryAfterMs: 1500 },
          { status: rateLimiterAllowed ? 200 : 429 },
        ),
    }) as unknown as DurableObjectStub,
} as unknown as DurableObjectNamespace;
const fakeKV = {} as unknown as KVNamespace;

// Recording dataset: each writeDataPoint append goes into points; tests assert
// blob layout matches event-metrics contract.
let recordedPoints: Array<{ indexes: string[]; blobs: string[]; doubles: number[] }> = [];
const fakeEvents = {
  writeDataPoint: (p: { indexes: string[]; blobs: string[]; doubles: number[] }) => {
    recordedPoints.push(p);
  },
} as unknown as AnalyticsEngineDataset;

function makeEnv(
  overrides: Partial<{ EVENTS_DISABLED: string; EVENTS: AnalyticsEngineDataset }> = {},
) {
  return {
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
    EVENTS: fakeEvents,
    ...overrides,
  } as const;
}

function makeEvent(
  overrides: Partial<{
    name: string;
    page: string;
    locale: string;
    visitor_id: string;
    props: Record<string, unknown>;
    referrer_host: string;
    utm: Record<string, string>;
    device_type: string;
  }> = {},
) {
  return {
    name: 'page_view',
    ts: Date.now(),
    page: '/try',
    locale: 'en',
    ...overrides,
  };
}

beforeEach(() => {
  mockSession = null;
  mockTier = 'free';
  rateLimiterAllowed = true;
  recordedPoints = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /v1/events — happy path', () => {
  it('accepts a single anonymous event and returns 202', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [makeEvent({ visitor_id: 'vid-1' })] }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(202);
    expect(recordedPoints).toHaveLength(1);
    expect(recordedPoints[0]?.blobs[10]).toBe('visitor'); // subject_kind
    expect(recordedPoints[0]?.blobs[9]).toBe('anon'); // tier
  });

  it('accepts a batch of multiple events', async () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent({ visitor_id: `vid-${i}`, props: { idx: i } }),
    );
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(202);
    expect(recordedPoints).toHaveLength(5);
  });

  it('logged-in users get subject_kind=user, tier from resolveUserTier', async () => {
    mockSession = { user: { id: 'u_pro', email: 'pro@test.com' } };
    mockTier = 'pro';
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [makeEvent({ visitor_id: 'unused-vid' })] }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(202);
    expect(recordedPoints[0]?.blobs[10]).toBe('user');
    expect(recordedPoints[0]?.blobs[9]).toBe('pro');
    // subject_id_hash is non-empty 16-hex
    expect(recordedPoints[0]?.blobs[11]).toMatch(/^[0-9a-f]{16}$/);
  });

  it('falls back to anonymous_no_id when no visitor_id and no session', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [makeEvent()] }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(202);
    expect(recordedPoints[0]?.blobs[10]).toBe('anonymous_no_id');
    expect(recordedPoints[0]?.blobs[11]).toBe(''); // no hash
  });
});

describe('POST /v1/events — invalid payload', () => {
  it('400 on invalid JSON', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json{',
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('400 on batch over MAX_EVENTS_PER_REQUEST (20)', async () => {
    const events = Array.from({ length: 21 }, () => makeEvent());
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('400 on empty batch', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [] }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('400 on unknown event name', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [makeEvent({ name: 'totally_made_up' })] }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when props contains a forbidden key substring', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [makeEvent({ props: { email: 'leak@test.com' } })],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe('invalid_props');
    expect(body.reason).toBe('forbidden_key');
  });

  it('400 when a single string prop exceeds 50 chars', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [makeEvent({ props: { tag: 'x'.repeat(51) } })],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/events — kill switch', () => {
  it('returns 204 with no DO call when EVENTS_DISABLED=1', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [makeEvent({ visitor_id: 'vid-1' })] }),
      },
      makeEnv({ EVENTS_DISABLED: '1' }),
    );
    expect(res.status).toBe(204);
    expect(recordedPoints).toHaveLength(0);
  });
});

describe('POST /v1/events — rate limit', () => {
  it('returns 429 with retry-after when DO denies', async () => {
    rateLimiterAllowed = false;
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [makeEvent({ visitor_id: 'vid-1' })] }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('2');
    expect(recordedPoints).toHaveLength(0);
  });
});

describe('POST /v1/events — visitor → user correlation', () => {
  it('signin_success carries linked_visitor_id through to event_props blob', async () => {
    mockSession = { user: { id: 'u_just_signed_in', email: 'x@test.com' } };
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [
            makeEvent({
              name: 'signin_success',
              page: '/login',
              props: { method: 'google', linked_visitor_id: 'vid-prev-session' },
            }),
          ],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(202);
    expect(recordedPoints[0]?.blobs[10]).toBe('user');
    const propsJson = recordedPoints[0]?.blobs[12] ?? '';
    expect(propsJson).toContain('"linked_visitor_id":"vid-prev-session"');
    expect(propsJson).toContain('"method":"google"');
  });
});

describe('POST /v1/events — fire-and-forget contract', () => {
  it('still returns 202 when EVENTS binding is undefined (local wrangler dev)', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [makeEvent({ visitor_id: 'vid-1' })] }),
      },
      makeEnv({ EVENTS: undefined }),
    );
    expect(res.status).toBe(202);
  });
});

describe('GET /v1/me — eventsEnabled echo', () => {
  it('anonymous response includes eventsEnabled=true when EVENTS_DISABLED is absent', async () => {
    const res = await app.request('/v1/me', { method: 'GET' }, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { eventsEnabled: boolean };
    expect(body.eventsEnabled).toBe(true);
  });

  it('eventsEnabled=false when EVENTS_DISABLED=1', async () => {
    const res = await app.request('/v1/me', { method: 'GET' }, makeEnv({ EVENTS_DISABLED: '1' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { eventsEnabled: boolean };
    expect(body.eventsEnabled).toBe(false);
  });
});
