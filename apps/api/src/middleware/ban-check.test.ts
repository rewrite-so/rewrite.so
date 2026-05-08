import { describe, expect, it } from 'vitest';
import { isUserBanned } from './ban-check.ts';

interface BanFixture {
  ban: { reason: string; expires_at: number | null } | null;
  selects: number;
}

function makeDb(fx: BanFixture): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM user_bans')) {
            fx.selects++;
            return fx.ban;
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

describe('isUserBanned', () => {
  it('returns null when no ban row exists', async () => {
    const fx: BanFixture = { ban: null, selects: 0 };
    expect(await isUserBanned(makeDb(fx), undefined, 'u1')).toBeNull();
    expect(fx.selects).toBe(1);
  });

  it('returns ban row with reason for permanent ban (expires_at = null)', async () => {
    const fx: BanFixture = { ban: { reason: 'abuse', expires_at: null }, selects: 0 };
    const ban = await isUserBanned(makeDb(fx), undefined, 'u1');
    expect(ban).not.toBeNull();
    expect(ban?.reason).toBe('abuse');
  });

  it('returns ban row when expires_at is in the future', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const fx: BanFixture = { ban: { reason: 'spam', expires_at: future }, selects: 0 };
    expect(await isUserBanned(makeDb(fx), undefined, 'u1')).not.toBeNull();
  });

  it('returns null when ban has already expired', async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const fx: BanFixture = { ban: { reason: 'old', expires_at: past }, selects: 0 };
    expect(await isUserBanned(makeDb(fx), undefined, 'u1')).toBeNull();
  });

  it('uses KV cache sentinel to skip D1 SELECT', async () => {
    const fx: BanFixture = { ban: null, selects: 0 };
    const { kv } = makeKv({ 'ban:u1': '__none__' });
    const ban = await isUserBanned(makeDb(fx), kv, 'u1');
    expect(ban).toBeNull();
    expect(fx.selects).toBe(0);
  });

  it('uses KV cache real value to skip D1 SELECT', async () => {
    const fx: BanFixture = { ban: null, selects: 0 };
    const { kv } = makeKv({
      'ban:u1': JSON.stringify({ reason: 'cached', expires_at: null }),
    });
    const ban = await isUserBanned(makeDb(fx), kv, 'u1');
    expect(ban?.reason).toBe('cached');
    expect(fx.selects).toBe(0);
  });

  it('writes sentinel to KV after a miss with no ban', async () => {
    const fx: BanFixture = { ban: null, selects: 0 };
    const { kv, store, ops } = makeKv();
    await isUserBanned(makeDb(fx), kv, 'u1');
    expect(ops.put).toBe(1);
    expect(store['ban:u1']).toBe('__none__');
  });

  it('writes serialized ban row to KV after a real-row miss', async () => {
    const fx: BanFixture = { ban: { reason: 'r', expires_at: null }, selects: 0 };
    const { kv, store } = makeKv();
    await isUserBanned(makeDb(fx), kv, 'u1');
    const cached = store['ban:u1'];
    expect(cached).not.toBe('__none__');
    expect(cached).toBeDefined();
    expect(JSON.parse(cached ?? '')).toEqual({ reason: 'r', expires_at: null });
  });
});
