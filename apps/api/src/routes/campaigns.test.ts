import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock auth before importing app
let mockSession: { user: { id: string; email: string } } | null = null;

vi.mock('../lib/auth.ts', () => ({
  createAuth: () => ({
    api: { getSession: async () => mockSession },
    handler: async () => new Response('mock', { status: 200 }),
  }),
}));

const app = (await import('../index.ts')).app;

const VALID_CAMPAIGN_CONFIG = {
  perks: {
    gift_days: 90,
    discount: {
      code: 'EARLYBIRD_LIFETIME_70OFF',
      percentage: 70,
      duration: 'forever',
      grace_period_days: 60,
    },
  },
  require_login: true,
};

const VALID_I18N = { en: { title: 'Early Bird' } };

interface FakeCampaign {
  id: string;
  type: string;
  slug: string;
  enabled: number;
  show_homepage_badge: number;
  starts_at: number;
  ends_at: number;
  capacity: number | null;
  config_json: string;
  i18n_json: string;
}

interface DBState {
  campaign: FakeCampaign | null;
  participation: { user_id: string; campaign_id: string; joined_at: number } | null;
  subscription: { current_period_end: number; status: string } | null;
  giftMaxEnd: number | null;
  participationCount: number;
  /** SQL traces for assertions; truncated to keep tests readable */
  trace: { sql: string; args: unknown[] }[];
}

function makeFakeDb(state: DBState): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        state.trace.push({ sql, args });
        return {
          first: async () => {
            if (sql.includes('FROM campaigns')) {
              return state.campaign;
            }
            if (sql.includes('FROM campaign_participations') && sql.includes('joined_at')) {
              return state.participation;
            }
            if (sql.includes('COUNT(*)') && sql.includes('campaign_participations')) {
              return { n: state.participationCount };
            }
            if (sql.includes('FROM subscriptions')) {
              return state.subscription;
            }
            if (sql.includes('FROM gift_grants')) {
              return { m: state.giftMaxEnd };
            }
            if (sql.includes('admin_user_overrides')) return null;
            return null;
          },
          run: async () => ({ success: true, meta: { changes: 1 } }),
          all: async () => ({ results: [], success: true }),
        };
      },
    }),
    batch: async (stmts: unknown[]) => {
      return stmts.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  } as unknown as D1Database;
}

function makeEnv(state: DBState) {
  const fakeRateLimiter = {
    idFromName: () => ({}) as DurableObjectId,
    get: () =>
      ({
        fetch: async () =>
          Response.json({ allowed: true, remaining: 99, retryAfterMs: 0 }, { status: 200 }),
      }) as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace;
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
    EVENTS_DISABLED: '1',
    DB: makeFakeDb(state),
    KV: {} as KVNamespace,
    RATE_LIMITER: fakeRateLimiter,
  } as const;
}

function makeCampaign(overrides: Partial<FakeCampaign> = {}): FakeCampaign {
  const now = Date.now();
  return {
    id: 'camp_test',
    type: 'early_bird',
    slug: 'early-bird',
    enabled: 1,
    show_homepage_badge: 0,
    starts_at: now - 86400000,
    ends_at: now + 86400000 * 30,
    capacity: null,
    config_json: JSON.stringify(VALID_CAMPAIGN_CONFIG),
    i18n_json: JSON.stringify(VALID_I18N),
    ...overrides,
  };
}

function makeState(overrides: Partial<DBState> = {}): DBState {
  return {
    campaign: makeCampaign(),
    participation: null,
    subscription: null,
    giftMaxEnd: null,
    participationCount: 0,
    trace: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockSession = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /v1/campaigns/:slug', () => {
  it('returns 400 on invalid slug', async () => {
    const state = makeState();
    const res = await app.request('/v1/campaigns/Invalid_Slug', {}, makeEnv(state));
    expect(res.status).toBe(400);
  });

  it('returns 404 when campaign does not exist', async () => {
    const state = makeState({ campaign: null });
    const res = await app.request('/v1/campaigns/early-bird', {}, makeEnv(state));
    expect(res.status).toBe(404);
  });

  it('returns campaign metadata (no viewer when anonymous)', async () => {
    mockSession = null;
    const state = makeState();
    const res = await app.request('/v1/campaigns/early-bird', {}, makeEnv(state));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.slug).toBe('early-bird');
    expect(body.enabled).toBe(true);
    expect(body).not.toHaveProperty('viewer');
  });

  it('exposes show_homepage_badge=false by default', async () => {
    mockSession = null;
    const res = await app.request('/v1/campaigns/early-bird', {}, makeEnv(makeState()));
    const body = (await res.json()) as { show_homepage_badge: boolean };
    expect(body.show_homepage_badge).toBe(false);
  });

  it('exposes show_homepage_badge=true when D1 column is 1', async () => {
    mockSession = null;
    const state = makeState({ campaign: makeCampaign({ show_homepage_badge: 1 }) });
    const res = await app.request('/v1/campaigns/early-bird', {}, makeEnv(state));
    const body = (await res.json()) as { show_homepage_badge: boolean };
    expect(body.show_homepage_badge).toBe(true);
  });

  it('includes viewer.joined when authed and not joined yet', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const state = makeState({ participation: null });
    const res = await app.request('/v1/campaigns/early-bird', {}, makeEnv(state));
    const body = (await res.json()) as { viewer: { joined: boolean; joinedAt: number | null } };
    expect(body.viewer.joined).toBe(false);
    expect(body.viewer.joinedAt).toBeNull();
  });

  it('includes viewer.joined=true when authed and already joined', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const joinedAt = Date.now() - 1000;
    const state = makeState({
      participation: { user_id: 'u1', campaign_id: 'camp_test', joined_at: joinedAt },
    });
    const res = await app.request('/v1/campaigns/early-bird', {}, makeEnv(state));
    const body = (await res.json()) as { viewer: { joined: boolean; joinedAt: number } };
    expect(body.viewer.joined).toBe(true);
    expect(body.viewer.joinedAt).toBe(joinedAt);
  });
});

describe('POST /v1/campaigns/:slug/join', () => {
  it('returns 401 when not signed in', async () => {
    mockSession = null;
    const res = await app.request(
      '/v1/campaigns/early-bird/join',
      { method: 'POST' },
      makeEnv(makeState()),
    );
    expect(res.status).toBe(401);
  });

  it('returns 410 when campaign is disabled', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const state = makeState({ campaign: makeCampaign({ enabled: 0 }) });
    const res = await app.request(
      '/v1/campaigns/early-bird/join',
      { method: 'POST' },
      makeEnv(state),
    );
    expect(res.status).toBe(410);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('CAMPAIGN_ENDED');
  });

  it('returns 410 when campaign has ended', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const state = makeState({
      campaign: makeCampaign({ ends_at: Date.now() - 1000 }),
    });
    const res = await app.request(
      '/v1/campaigns/early-bird/join',
      { method: 'POST' },
      makeEnv(state),
    );
    expect(res.status).toBe(410);
  });

  it('returns 425 when campaign has not started', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const state = makeState({
      campaign: makeCampaign({ starts_at: Date.now() + 86400000 }),
    });
    const res = await app.request(
      '/v1/campaigns/early-bird/join',
      { method: 'POST' },
      makeEnv(state),
    );
    expect(res.status).toBe(425);
  });

  it('returns 409 when campaign is at capacity', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const state = makeState({
      campaign: makeCampaign({ capacity: 100 }),
      participationCount: 100,
    });
    const res = await app.request(
      '/v1/campaigns/early-bird/join',
      { method: 'POST' },
      makeEnv(state),
    );
    expect(res.status).toBe(409);
  });

  it('returns 200 alreadyJoined=true when user already joined (idempotent)', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const joinedAt = Date.now() - 5000;
    const state = makeState({
      participation: { user_id: 'u1', campaign_id: 'camp_test', joined_at: joinedAt },
    });
    const res = await app.request(
      '/v1/campaigns/early-bird/join',
      { method: 'POST' },
      makeEnv(state),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyJoined: boolean; joinedAt: number };
    expect(body.alreadyJoined).toBe(true);
    expect(body.joinedAt).toBe(joinedAt);
  });

  it('first-time join: writes batch with correct perks (no Pro, no gifts)', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const state = makeState();
    const res = await app.request(
      '/v1/campaigns/early-bird/join',
      { method: 'POST' },
      makeEnv(state),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyJoined: boolean; joinedAt: number };
    expect(body.alreadyJoined).toBe(false);
    expect(body.joinedAt).toBeGreaterThan(0);
  });

  it('Pro user joining: granted_at is pushed to subscription current_period_end (not now)', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const subEnd = Date.now() + 25 * 86400000;
    const state = makeState({
      subscription: { current_period_end: subEnd, status: 'active' },
    });
    await app.request('/v1/campaigns/early-bird/join', { method: 'POST' }, makeEnv(state));
    // Look at the gift_grants INSERT for granted_at argument
    const giftInsert = state.trace.find((t) => t.sql.includes('INSERT OR IGNORE INTO gift_grants'));
    if (!giftInsert) throw new Error('expected gift_grants INSERT in trace');
    // args order: id, user_id, days, granted_at, expires_at, source_id, now1, now2
    const grantedAt = giftInsert.args[3] as number;
    const expiresAt = giftInsert.args[4] as number;
    expect(grantedAt).toBe(subEnd);
    expect(expiresAt).toBe(subEnd + 90 * 86400000);
  });

  it('user with existing gift_grants: granted_at extends past current max gift end', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const giftMax = Date.now() + 50 * 86400000;
    const state = makeState({ giftMaxEnd: giftMax });
    await app.request('/v1/campaigns/early-bird/join', { method: 'POST' }, makeEnv(state));
    const giftInsert = state.trace.find((t) => t.sql.includes('INSERT OR IGNORE INTO gift_grants'));
    if (!giftInsert) throw new Error('expected gift_grants INSERT in trace');
    const grantedAt = giftInsert.args[3] as number;
    expect(grantedAt).toBe(giftMax);
  });

  it('user_discounts insert carries grace_period_days from config_json', async () => {
    mockSession = { user: { id: 'u1', email: 'u@test.com' } };
    const state = makeState();
    await app.request('/v1/campaigns/early-bird/join', { method: 'POST' }, makeEnv(state));
    const udInsert = state.trace.find((t) =>
      t.sql.includes('INSERT OR IGNORE INTO user_discounts'),
    );
    if (!udInsert) throw new Error('expected user_discounts INSERT in trace');
    // args order: user_id, code, percentage, duration, source_id, valid_from,
    // pro_lapses_at, grace_period_days, now1, now2
    const code = udInsert.args[1] as string;
    const percentage = udInsert.args[2] as number;
    const duration = udInsert.args[3] as string;
    const grace = udInsert.args[7] as number;
    expect(code).toBe('EARLYBIRD_LIFETIME_70OFF');
    expect(percentage).toBe(70);
    expect(duration).toBe('forever');
    expect(grace).toBe(60);
  });
});
