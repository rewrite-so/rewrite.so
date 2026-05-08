import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// auth 必须在 import app 之前 mock
let mockSession: { user: { id: string; email: string } } | null = null;

vi.mock('../lib/auth.ts', () => ({
  createAuth: () => ({
    api: { getSession: async () => mockSession },
    handler: async () => new Response('mock', { status: 200 }),
  }),
}));

const app = (await import('../index.ts')).app;

interface AnnouncementSeed {
  id: string;
  kind: string;
  surfaces: string[];
  locale_filter: string | null;
  tier_filter: string | null;
  title_i18n: Record<string, string>;
  body_i18n: Record<string, string>;
  cta_i18n?: Record<string, { label: string; href: string }>;
  starts_at: number; // seconds
  ends_at: number; // seconds
  priority?: number;
}

interface FixtureState {
  seeds: AnnouncementSeed[];
  /** 模拟 admin_user_overrides 行（按 user_id） */
  overrides: Record<string, { force_tier: 'pro' | 'free'; expires_at: number | null }>;
  /** 模拟 subscriptions 表（按 user_id 取最新一行） */
  subscriptions: Record<string, { status: string; current_period_end: number }>;
  /** 计算 announcements SELECT 的次数（验证 KV 缓存命中） */
  announcementSelects: number;
}

function makeDb(fx: FixtureState): D1Database {
  const matches = (
    seed: AnnouncementSeed,
    nowSec: number,
    tierParam: string | undefined,
    localeParam: string,
  ): boolean => {
    if (seed.starts_at > nowSec || seed.ends_at <= nowSec) return false;
    if (seed.tier_filter !== null && seed.tier_filter !== tierParam) return false;
    if (seed.locale_filter !== null && seed.locale_filter !== localeParam) return false;
    return true;
  };

  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM admin_user_overrides')) {
            const userId = args[0] as string;
            return fx.overrides[userId] ?? null;
          }
          if (sql.includes('FROM subscriptions')) {
            const userId = args[0] as string;
            return fx.subscriptions[userId] ?? null;
          }
          return null;
        },
        run: async () => ({ success: true, meta: { changes: 1 } }),
        all: async () => {
          if (sql.includes('FROM announcements')) {
            fx.announcementSelects++;
            const nowSec = args[0] as number;
            // tier_filter 子句：anonymous → 仅 NULL；非 anonymous → NULL OR =?
            const hasTierParam = sql.includes('tier_filter = ?');
            const tierParam = hasTierParam ? (args[2] as string) : undefined;
            const localeParam = (hasTierParam ? args[3] : args[2]) as string;
            const filtered = fx.seeds
              .filter((s) => matches(s, nowSec, tierParam, localeParam))
              .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.starts_at - a.starts_at)
              .map((s) => ({
                id: s.id,
                kind: s.kind,
                surfaces: JSON.stringify(s.surfaces),
                locale_filter: s.locale_filter,
                tier_filter: s.tier_filter,
                title_i18n: JSON.stringify(s.title_i18n),
                body_i18n: JSON.stringify(s.body_i18n),
                cta_i18n: s.cta_i18n ? JSON.stringify(s.cta_i18n) : null,
                starts_at: s.starts_at,
                ends_at: s.ends_at,
                priority: s.priority ?? 0,
              }));
            return { results: filtered, success: true };
          }
          return { results: [], success: true };
        },
      }),
    }),
  } as unknown as D1Database;
}

const fakeRateLimiter = {
  idFromName: () => ({}) as DurableObjectId,
  get: () =>
    ({
      fetch: async () =>
        Response.json({ allowed: true, remaining: 99, retryAfterMs: 0 }, { status: 200 }),
    }) as unknown as DurableObjectStub,
} as unknown as DurableObjectNamespace;

function buildEnv(fx: FixtureState) {
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
    DB: makeDb(fx),
    KV: {} as unknown as KVNamespace,
    RATE_LIMITER: fakeRateLimiter,
  } as const;
}

beforeEach(() => {
  mockSession = null;
});
afterEach(() => {
  vi.restoreAllMocks();
});

const nowSec = () => Math.floor(Date.now() / 1000);

const ACTIVE_PRO_ONLY: AnnouncementSeed = {
  id: 'pro-banner',
  kind: 'banner',
  surfaces: ['web', 'extension'],
  locale_filter: null,
  tier_filter: 'pro',
  title_i18n: { en: 'Pro Tip', 'zh-CN': '专业提示' },
  body_i18n: { en: 'You are pro!' },
  starts_at: nowSec() - 100,
  ends_at: nowSec() + 86400,
};

const ACTIVE_GENERAL: AnnouncementSeed = {
  id: 'general',
  kind: 'banner',
  surfaces: ['web', 'extension'],
  locale_filter: null,
  tier_filter: null,
  title_i18n: { en: 'Welcome', 'zh-CN': '欢迎' },
  body_i18n: { en: 'Hello world' },
  starts_at: nowSec() - 100,
  ends_at: nowSec() + 86400,
};

const PAST_GENERAL: AnnouncementSeed = {
  id: 'past',
  kind: 'banner',
  surfaces: ['web'],
  locale_filter: null,
  tier_filter: null,
  title_i18n: { en: 'Old' },
  body_i18n: { en: '...' },
  starts_at: nowSec() - 7200,
  ends_at: nowSec() - 3600,
};

describe('GET /v1/announcements — tier privacy', () => {
  it('anonymous user only sees tier_filter=NULL items, never pro-only', async () => {
    const fx: FixtureState = {
      seeds: [ACTIVE_PRO_ONLY, ACTIVE_GENERAL],
      overrides: {},
      subscriptions: {},
      announcementSelects: 0,
    };
    mockSession = null;
    const res = await app.request('/v1/announcements?locale=en&surface=web', {}, buildEnv(fx));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toEqual(['general']);
  });

  it('client-supplied ?tier=pro is ignored — anonymous still cannot see pro content', async () => {
    const fx: FixtureState = {
      seeds: [ACTIVE_PRO_ONLY, ACTIVE_GENERAL],
      overrides: {},
      subscriptions: {},
      announcementSelects: 0,
    };
    mockSession = null;
    const res = await app.request(
      '/v1/announcements?locale=en&surface=web&tier=pro',
      {},
      buildEnv(fx),
    );
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toEqual(['general']);
  });

  it('signed-in pro user sees both general and pro-only items', async () => {
    const fx: FixtureState = {
      seeds: [ACTIVE_PRO_ONLY, ACTIVE_GENERAL],
      overrides: {},
      subscriptions: {
        u1: { status: 'active', current_period_end: Date.now() + 86400_000 },
      },
      announcementSelects: 0,
    };
    mockSession = { user: { id: 'u1', email: 'u@test' } };
    const res = await app.request('/v1/announcements?locale=en&surface=web', {}, buildEnv(fx));
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id).sort()).toEqual(['general', 'pro-banner']);
  });

  it('signed-in free user sees only tier_filter=NULL items, not pro', async () => {
    const fx: FixtureState = {
      seeds: [ACTIVE_PRO_ONLY, ACTIVE_GENERAL],
      overrides: {},
      subscriptions: {},
      announcementSelects: 0,
    };
    mockSession = { user: { id: 'u_free', email: 'f@test' } };
    const res = await app.request('/v1/announcements?locale=en&surface=web', {}, buildEnv(fx));
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toEqual(['general']);
  });
});

describe('GET /v1/announcements — locale & surface filtering', () => {
  it('filters out announcements outside the time window', async () => {
    const fx: FixtureState = {
      seeds: [PAST_GENERAL, ACTIVE_GENERAL],
      overrides: {},
      subscriptions: {},
      announcementSelects: 0,
    };
    mockSession = null;
    const res = await app.request('/v1/announcements?locale=en&surface=web', {}, buildEnv(fx));
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toEqual(['general']);
  });

  it('filters by surface (extension-only consumer should not get web-only banners)', async () => {
    const webOnly: AnnouncementSeed = {
      ...ACTIVE_GENERAL,
      id: 'web-only',
      surfaces: ['web'],
    };
    const fx: FixtureState = {
      seeds: [webOnly],
      overrides: {},
      subscriptions: {},
      announcementSelects: 0,
    };
    mockSession = null;
    const res = await app.request(
      '/v1/announcements?locale=en&surface=extension',
      {},
      buildEnv(fx),
    );
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });

  it('rejects unsupported locale with 400', async () => {
    const fx: FixtureState = {
      seeds: [],
      overrides: {},
      subscriptions: {},
      announcementSelects: 0,
    };
    mockSession = null;
    const res = await app.request('/v1/announcements?locale=ru&surface=web', {}, buildEnv(fx));
    expect(res.status).toBe(400);
  });

  it('rejects unsupported surface with 400', async () => {
    const fx: FixtureState = {
      seeds: [],
      overrides: {},
      subscriptions: {},
      announcementSelects: 0,
    };
    mockSession = null;
    const res = await app.request('/v1/announcements?locale=en&surface=ios', {}, buildEnv(fx));
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/announcements — i18n projection', () => {
  it('returns the locale-specific title/body when available', async () => {
    const fx: FixtureState = {
      seeds: [ACTIVE_GENERAL],
      overrides: {},
      subscriptions: {},
      announcementSelects: 0,
    };
    mockSession = null;
    const res = await app.request('/v1/announcements?locale=zh-CN&surface=web', {}, buildEnv(fx));
    const body = (await res.json()) as { items: { title: string }[] };
    expect(body.items[0]?.title).toBe('欢迎');
  });

  it('falls back to English when target locale has no translation', async () => {
    const fx: FixtureState = {
      seeds: [ACTIVE_PRO_ONLY], // body_i18n only has 'en'
      overrides: {},
      subscriptions: {
        u: { status: 'active', current_period_end: Date.now() + 86400_000 },
      },
      announcementSelects: 0,
    };
    mockSession = { user: { id: 'u', email: 'u@x' } };
    const res = await app.request('/v1/announcements?locale=ja&surface=web', {}, buildEnv(fx));
    const body = (await res.json()) as { items: { body: string }[] };
    expect(body.items[0]?.body).toBe('You are pro!');
  });
});

describe('GET /v1/announcements — caching', () => {
  it('emits Cache-Control: max-age=60 so clients (web/extension) cache by themselves', async () => {
    const fx: FixtureState = {
      seeds: [ACTIVE_GENERAL],
      overrides: {},
      subscriptions: {},
      announcementSelects: 0,
    };
    mockSession = null;
    const res = await app.request('/v1/announcements?locale=en&surface=web', {}, buildEnv(fx));
    expect(res.headers.get('cache-control')).toContain('max-age=60');
  });

  it('hits D1 on every request (no server-side cache)', async () => {
    // Decision: announcements table has very few active rows (~handful per month),
    // and admin worker writes need to take effect immediately. So every GET hits
    // D1 directly rather than going through KV.
    const fx: FixtureState = {
      seeds: [ACTIVE_GENERAL],
      overrides: {},
      subscriptions: {},
      announcementSelects: 0,
    };
    mockSession = null;
    const env = buildEnv(fx);
    await app.request('/v1/announcements?locale=en&surface=web', {}, env);
    await app.request('/v1/announcements?locale=en&surface=web', {}, env);
    await app.request('/v1/announcements?locale=en&surface=web', {}, env);
    expect(fx.announcementSelects).toBe(3);
  });
});
