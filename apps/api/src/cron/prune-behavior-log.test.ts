import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bindings } from '../types.ts';
import { pruneBehaviorLog, RETENTION_DAYS } from './prune-behavior-log.ts';

const DAY_MS = 86_400_000;

interface FakeRow {
  created_at?: number;
  ts?: number;
}

/**
 * Minimal D1 fake that actually applies the `DELETE ... WHERE <col> < ?`
 * filter, so the retention boundary (strict `<`) is genuinely exercised —
 * not just the SQL string asserted.
 */
function makeFakeDB(tables: {
  behavior_events: FakeRow[];
  rewrite_request_log: FakeRow[];
}): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (cutoff: number) => ({
        run: async () => {
          let changes = 0;
          if (sql.includes('DELETE FROM behavior_events')) {
            expect(sql).toContain('created_at <');
            const before = tables.behavior_events.length;
            tables.behavior_events = tables.behavior_events.filter(
              (r) => !((r.created_at ?? 0) < cutoff),
            );
            changes = before - tables.behavior_events.length;
          } else if (sql.includes('DELETE FROM rewrite_request_log')) {
            expect(sql).toContain('ts <');
            const before = tables.rewrite_request_log.length;
            tables.rewrite_request_log = tables.rewrite_request_log.filter(
              (r) => !((r.ts ?? 0) < cutoff),
            );
            changes = before - tables.rewrite_request_log.length;
          }
          return { success: true, meta: { changes } };
        },
      }),
    }),
  } as unknown as D1Database;
}

function makeEnv(db: D1Database): Bindings {
  return { DB: db } as unknown as Bindings;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('pruneBehaviorLog', () => {
  it('deletes rows older than the cutoff; keeps cutoff-exact and newer (strict <)', async () => {
    const now = 1_800_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const cutoff = now - RETENTION_DAYS * DAY_MS;

    const tables = {
      behavior_events: [
        { created_at: cutoff - 1 }, // older → deleted
        { created_at: cutoff }, // exact boundary → kept
        { created_at: cutoff + 1 }, // newer → kept
      ],
      rewrite_request_log: [
        { ts: cutoff - 1000 }, // deleted
        { ts: cutoff + 1000 }, // kept
      ],
    };

    const result = await pruneBehaviorLog(makeEnv(makeFakeDB(tables)));

    expect(result).toEqual({ behaviorEvents: 1, rewriteRequestLog: 1 });
    expect(tables.behavior_events).toHaveLength(2);
    expect(tables.rewrite_request_log).toHaveLength(1);
  });

  it('empty tables → zero counts', async () => {
    const result = await pruneBehaviorLog(
      makeEnv(makeFakeDB({ behavior_events: [], rewrite_request_log: [] })),
    );
    expect(result).toEqual({ behaviorEvents: 0, rewriteRequestLog: 0 });
  });
});
