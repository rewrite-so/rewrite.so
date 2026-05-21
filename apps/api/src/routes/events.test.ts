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
    session_id: string;
    install_id: string;
    site: string;
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

  it('accepts an event carrying a valid session_id', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [
            makeEvent({ visitor_id: 'vid-1', session_id: '018f5c64-9a4d-7f5e-8001-fe8c9c54f0e1' }),
          ],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(202);
  });

  it('accepts an event with no session_id (field is optional)', async () => {
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

  it('logged-in user with a BYOK row gets tier=byok, not free', async () => {
    // Without the byok_keys lookup, BYOK users' events landed as tier='free'
    // while their byok_save event landed as tier='byok' — inconsistent.
    mockSession = { user: { id: 'u_byok', email: 'byok@test.com' } };
    mockTier = 'free';
    const byokDB = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (sql.includes('FROM byok_keys')) return { 1: 1 };
            return null;
          },
          run: async () => ({ success: true }),
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [makeEvent({ visitor_id: 'v' })] }),
      },
      { ...makeEnv(), DB: byokDB },
    );
    expect(res.status).toBe(202);
    expect(recordedPoints[0]?.blobs[9]).toBe('byok');
  });

  it('logged-in pro user keeps tier=pro even if a stale byok_keys row exists', async () => {
    // Pro takes precedence over BYOK lookup — the byok_keys query never fires.
    mockSession = { user: { id: 'u_pro', email: 'pro@test.com' } };
    mockTier = 'pro';
    let byokQueried = false;
    const proDB = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (sql.includes('FROM byok_keys')) {
              byokQueried = true;
              return { 1: 1 };
            }
            return null;
          },
          run: async () => ({ success: true }),
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [makeEvent({ visitor_id: 'v' })] }),
      },
      { ...makeEnv(), DB: proDB },
    );
    expect(res.status).toBe(202);
    expect(recordedPoints[0]?.blobs[9]).toBe('pro');
    expect(byokQueried).toBe(false); // short-circuit
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

  it('anonymous extension event (install_id, no session) gets subject_kind=install + site blob', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [
            makeEvent({
              name: 'ext_trigger',
              page: '/ext',
              install_id: 'inst-abc-123',
              site: 'reddit',
              props: { has_selection: 1 },
            }),
          ],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(202);
    expect(recordedPoints[0]?.blobs[10]).toBe('install'); // subject_kind
    expect(recordedPoints[0]?.blobs[11]).toMatch(/^[0-9a-f]{16}$/); // hashed install id
    expect(recordedPoints[0]?.blobs[13]).toBe('reddit'); // site → blob14
  });

  it('logged-in extension user (cookie session) gets subject_kind=user even when install_id is present', async () => {
    mockSession = { user: { id: 'u_ext', email: 'ext@test.com' } };
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [
            makeEvent({
              name: 'ext_accept',
              page: '/ext',
              install_id: 'inst-abc-123',
              props: { style: 'casual' },
            }),
          ],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(202);
    expect(recordedPoints[0]?.blobs[10]).toBe('user');
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

  it('400 when page field tries to smuggle a query string', async () => {
    // PII smuggling vector: zod only checks max(200) on `page`, so without
    // the per-field pattern allow-list the server would write
    // `?email=foo@bar.com` straight into blob2.
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [makeEvent({ page: '/try?email=leak@x.com' })],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string };
    expect(body.error).toBe('invalid_field');
    expect(body.field).toBe('page');
  });

  it('400 when referrer_host carries an email-shaped string', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [makeEvent({ referrer_host: 'user@evil.com' })],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when utm.source has a forbidden character', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [makeEvent({ utm: { source: 'name=value' } })],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when visitor_id contains spaces / non-UUID chars', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [makeEvent({ visitor_id: 'has space and @' })],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when install_id contains forbidden characters', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [makeEvent({ name: 'ext_trigger', install_id: 'has space@x' })],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when session_id contains forbidden characters', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [makeEvent({ session_id: 'has space@x' })],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field?: string };
    expect(body.error).toBe('invalid_field');
    expect(body.field).toBe('session_id');
  });

  it('400 on a non-whitelisted site label', async () => {
    const res = await app.request(
      '/v1/events',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: [makeEvent({ name: 'ext_trigger', install_id: 'inst-1', site: 'facebook' })],
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
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
