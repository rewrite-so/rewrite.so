import { describe, expect, it } from 'vitest';
import { checkAndIncrement } from './quota.ts';

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
