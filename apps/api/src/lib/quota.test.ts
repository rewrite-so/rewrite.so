import { describe, expect, it } from 'vitest';
import { checkAndIncrement, resolveUserTier } from './quota.ts';

describe('checkAndIncrement', () => {
  it('creates a missing usage row and consumes one request', async () => {
    let count: number | null = null;
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (!sql.includes('SELECT count FROM usage_monthly')) return null;
            return count === null ? null : { count };
          },
          run: async () => {
            if (sql.includes('INSERT OR IGNORE INTO usage_monthly') && count === null) count = 0;
            if (sql.includes('UPDATE usage_monthly')) {
              const limit = args[4] as number;
              if ((count ?? 0) < limit) {
                count = (count ?? 0) + 1;
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            }
            return { success: true, meta: { changes: 1 } };
          },
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const result = await checkAndIncrement(db, { kind: 'ip', id: 'ip1' }, 'anonymous_ip', false);

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
    expect(result.remaining).toBe(9);
  });

  it('rejects when the atomic update loses a quota race', async () => {
    let selectCount = 0;
    const db = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (!sql.includes('SELECT count FROM usage_monthly')) return null;
            selectCount++;
            return { count: selectCount === 1 ? 9 : 10 };
          },
          run: async () => ({ success: true, meta: { changes: sql.includes('UPDATE') ? 0 : 1 } }),
          all: async () => ({ results: [], success: true }),
        }),
      }),
    } as unknown as D1Database;

    const result = await checkAndIncrement(db, { kind: 'ip', id: 'ip1' }, 'anonymous_ip', false);

    expect(result.allowed).toBe(false);
    expect(result.used).toBe(10);
    expect(result.remaining).toBe(0);
  });
});

// ===== resolveUserTier =====
// Test fixture: a fake D1 + KV that records SELECT calls so we can assert
// override is queried first, and that KV cache hits skip the override SELECT.
interface FakeFixture {
  override: { force_tier: 'pro' | 'free'; expires_at: number | null } | null;
  sub: { status: string; current_period_end: number } | null;
  /** When non-null, gift_grants SELECT returns a hit row (tier resolves to pro) */
  gift?: { 1: 1 } | null;
  /** Per-call counters; verifies cache + priority behaviour */
  selects: { override: number; subscriptions: number; gift: number };
}

function makeDb(fx: FakeFixture): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM admin_user_overrides')) {
            fx.selects.override++;
            return fx.override;
          }
          if (sql.includes('FROM subscriptions')) {
            fx.selects.subscriptions++;
            return fx.sub;
          }
          if (sql.includes('FROM gift_grants')) {
            fx.selects.gift++;
            return fx.gift ?? null;
          }
          return null;
        },
        run: async () => ({ success: true, meta: { changes: 1 } }),
        all: async () => ({ results: [], success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function makeKv(initial: Record<string, string> = {}): {
  kv: KVNamespace;
  store: Record<string, string>;
  ops: { get: number; put: number };
} {
  const store = { ...initial };
  const ops = { get: 0, put: 0 };
  const kv = {
    get: async (k: string) => {
      ops.get++;
      return store[k] ?? null;
    },
    put: async (k: string, v: string) => {
      ops.put++;
      store[k] = v;
    },
  } as unknown as KVNamespace;
  return { kv, store, ops };
}

describe('resolveUserTier', () => {
  it('returns free when no override and no subscription', async () => {
    const fx: FakeFixture = {
      override: null,
      sub: null,
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    const tier = await resolveUserTier(makeDb(fx), 'u1');
    expect(tier).toBe('free');
    expect(fx.selects.override).toBe(1);
    expect(fx.selects.subscriptions).toBe(1);
  });

  it('returns pro when subscription is active and no override', async () => {
    const fx: FakeFixture = {
      override: null,
      sub: { status: 'active', current_period_end: Date.now() + 86400_000 },
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    expect(await resolveUserTier(makeDb(fx), 'u1')).toBe('pro');
  });

  it('override force_tier=pro takes precedence over no/expired subscription', async () => {
    const fx: FakeFixture = {
      override: { force_tier: 'pro', expires_at: null }, // permanent override
      sub: null,
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    expect(await resolveUserTier(makeDb(fx), 'u1')).toBe('pro');
    // subscriptions table not consulted when override hits
    expect(fx.selects.subscriptions).toBe(0);
  });

  it('override force_tier=free overrides an active pro subscription', async () => {
    const fx: FakeFixture = {
      override: { force_tier: 'free', expires_at: null },
      sub: { status: 'active', current_period_end: Date.now() + 86400_000 },
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    expect(await resolveUserTier(makeDb(fx), 'u1')).toBe('free');
    expect(fx.selects.subscriptions).toBe(0);
  });

  it('expired override falls through to subscriptions lookup', async () => {
    const fx: FakeFixture = {
      override: { force_tier: 'pro', expires_at: Math.floor(Date.now() / 1000) - 60 }, // expired 1min ago
      sub: null,
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    expect(await resolveUserTier(makeDb(fx), 'u1')).toBe('free');
    expect(fx.selects.subscriptions).toBe(1);
  });

  it('canceled-but-period-not-ended subscription stays pro', async () => {
    const fx: FakeFixture = {
      override: null,
      sub: { status: 'canceled', current_period_end: Date.now() + 86400_000 },
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    expect(await resolveUserTier(makeDb(fx), 'u1')).toBe('pro');
  });

  it('KV cache hit (sentinel) skips the override SELECT', async () => {
    const fx: FakeFixture = {
      override: null,
      sub: null,
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    const { kv } = makeKv({ 'override:u1': '__none__' });
    await resolveUserTier(makeDb(fx), 'u1', kv);
    expect(fx.selects.override).toBe(0); // cache hit
    expect(fx.selects.subscriptions).toBe(1);
  });

  it('KV cache hit (real override row) skips both SELECTs', async () => {
    const fx: FakeFixture = {
      override: null,
      sub: null,
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    const { kv } = makeKv({
      'override:u1': JSON.stringify({ force_tier: 'pro', expires_at: null }),
    });
    expect(await resolveUserTier(makeDb(fx), 'u1', kv)).toBe('pro');
    expect(fx.selects.override).toBe(0);
    expect(fx.selects.subscriptions).toBe(0);
  });

  it('KV cache miss writes both override + gift_active sentinels', async () => {
    const fx: FakeFixture = {
      override: null,
      sub: null,
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    const { kv, store, ops } = makeKv();
    await resolveUserTier(makeDb(fx), 'u1', kv);
    // Both override + gift_active sentinels are written on full miss path
    expect(ops.put).toBe(2);
    expect(store['override:u1']).toBe('__none__');
    expect(store['gift_active:u1']).toBe('__none__');
  });

  it('returns pro when no override, no subscription, but gift_grants is active', async () => {
    const fx: FakeFixture = {
      override: null,
      sub: null,
      gift: { 1: 1 },
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    expect(await resolveUserTier(makeDb(fx), 'u1')).toBe('pro');
    expect(fx.selects.gift).toBe(1);
  });

  it('returns pro when gift_grants present even without subscription row', async () => {
    const fx: FakeFixture = {
      override: null,
      sub: null,
      gift: { 1: 1 },
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    const { kv, store } = makeKv();
    expect(await resolveUserTier(makeDb(fx), 'u1', kv)).toBe('pro');
    expect(store['gift_active:u1']).toBe('1');
  });

  it('gift_active KV hit (true sentinel) skips gift_grants SELECT', async () => {
    const fx: FakeFixture = {
      override: null,
      sub: null,
      gift: null,
      selects: { override: 0, subscriptions: 0, gift: 0 },
    };
    const { kv } = makeKv({ 'override:u1': '__none__', 'gift_active:u1': '1' });
    expect(await resolveUserTier(makeDb(fx), 'u1', kv)).toBe('pro');
    expect(fx.selects.gift).toBe(0);
  });
});
