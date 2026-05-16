import { describe, expect, it } from 'vitest';
import { computeGrantId, getCurrentMaxGiftExpiresAt, grantDays } from './gift-grants.ts';

interface Row {
  id: string;
  user_id: string;
  days: number;
  granted_at: number;
  expires_at: number;
  source_kind: string;
  source_id: string;
  status: string;
  note: string | null;
}

/**
 * Minimal in-memory gift_grants table fake supporting:
 *  - INSERT OR IGNORE (PK = id)
 *  - SELECT MAX(expires_at) WHERE user/status/expires_at filter
 *
 * Returns { db, rows } so tests can assert on the persisted state.
 */
function makeFakeDb(): { db: D1Database; rows: Row[] } {
  const rows: Row[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT MAX(expires_at)')) {
            const [userId, now] = args as [string, number];
            const matches = rows.filter(
              (r) => r.user_id === userId && r.status === 'active' && r.expires_at > now,
            );
            if (matches.length === 0) return { m: null };
            const m = matches.reduce((a, b) => Math.max(a, b.expires_at), 0);
            return { m };
          }
          return null;
        },
        run: async () => {
          if (sql.includes('INSERT OR IGNORE INTO gift_grants')) {
            const [
              id,
              user_id,
              days,
              granted_at,
              expires_at,
              source_kind,
              source_id,
              note,
              _now1,
              _now2,
            ] = args as [
              string,
              string,
              number,
              number,
              number,
              string,
              string,
              string | null,
              number,
              number,
            ];
            // INSERT OR IGNORE: PK conflict → changes=0
            if (rows.some((r) => r.id === id)) {
              return { success: true, meta: { changes: 0 } };
            }
            rows.push({
              id,
              user_id,
              days,
              granted_at,
              expires_at,
              source_kind,
              source_id,
              status: 'active',
              note: note ?? null,
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        all: async () => ({ results: [], success: true }),
      }),
    }),
  } as unknown as D1Database;
  return { db, rows };
}

describe('computeGrantId', () => {
  it('returns deterministic id for same input', async () => {
    const a = await computeGrantId('user_1', 'campaign', 'camp_early');
    const b = await computeGrantId('user_1', 'campaign', 'camp_early');
    expect(a).toBe(b);
    expect(a.startsWith('gg_')).toBe(true);
  });

  it('returns different ids for different sourceId', async () => {
    const a = await computeGrantId('user_1', 'campaign', 'camp_early');
    const b = await computeGrantId('user_1', 'campaign', 'camp_other');
    expect(a).not.toBe(b);
  });

  it('returns different ids for different userId', async () => {
    const a = await computeGrantId('user_1', 'campaign', 'camp_early');
    const b = await computeGrantId('user_2', 'campaign', 'camp_early');
    expect(a).not.toBe(b);
  });
});

describe('grantDays', () => {
  it('inserts a fresh grant when none exist', async () => {
    const { db, rows } = makeFakeDb();
    const before = Date.now();
    const r = await grantDays(db, {
      userId: 'u1',
      days: 90,
      sourceKind: 'campaign',
      sourceId: 'camp_early',
    });
    expect(r.isDuplicate).toBe(false);
    expect(rows).toHaveLength(1);
    const row0 = rows[0];
    if (!row0) throw new Error('expected row[0]');
    expect(row0.days).toBe(90);
    expect(row0.granted_at).toBeGreaterThanOrEqual(before);
    // expires_at == granted_at + 90 days
    expect(row0.expires_at - row0.granted_at).toBe(90 * 86400000);
  });

  it('is idempotent on retry with same sourceId (deterministic id → PK conflict)', async () => {
    const { db, rows } = makeFakeDb();
    const r1 = await grantDays(db, {
      userId: 'u1',
      days: 90,
      sourceKind: 'campaign',
      sourceId: 'camp_early',
    });
    const r2 = await grantDays(db, {
      userId: 'u1',
      days: 90,
      sourceKind: 'campaign',
      sourceId: 'camp_early',
    });
    expect(r1.isDuplicate).toBe(false);
    expect(r2.isDuplicate).toBe(true);
    expect(r1.id).toBe(r2.id);
    expect(rows).toHaveLength(1);
  });

  it('stacks multiple grants with different sourceId — granted_at extends past existing max(expires_at)', async () => {
    const { db, rows } = makeFakeDb();
    await grantDays(db, {
      userId: 'u1',
      days: 90,
      sourceKind: 'campaign',
      sourceId: 'camp_early',
    });
    const firstRow = rows[0];
    if (!firstRow) throw new Error('expected first row');
    const firstExpiry = firstRow.expires_at;
    // Second grant uses different sourceId → distinct id; granted_at should be firstExpiry, not now
    const r2 = await grantDays(db, {
      userId: 'u1',
      days: 15,
      sourceKind: 'admin',
      sourceId: 'admin_a:1234',
    });
    expect(r2.isDuplicate).toBe(false);
    expect(rows).toHaveLength(2);
    expect(r2.granted_at).toBe(firstExpiry);
    expect(r2.expires_at).toBe(firstExpiry + 15 * 86400000);
  });

  it('respects caller-provided baseEnd (e.g. subscription.current_period_end) when greater than max gift end', async () => {
    const { db, rows } = makeFakeDb();
    const subEnd = Date.now() + 30 * 86400000;
    const r = await grantDays(db, {
      userId: 'u1',
      days: 90,
      sourceKind: 'campaign',
      sourceId: 'camp_early',
      baseEnd: subEnd,
    });
    expect(r.granted_at).toBe(subEnd);
    const row0 = rows[0];
    if (!row0) throw new Error('expected row[0]');
    expect(row0.expires_at).toBe(subEnd + 90 * 86400000);
  });

  it('granted_at = max(now, baseEnd, currentMaxGiftExpiresAt)', async () => {
    const { db, rows } = makeFakeDb();
    await grantDays(db, {
      userId: 'u1',
      days: 30,
      sourceKind: 'campaign',
      sourceId: 'camp_a',
    });
    const firstRow = rows[0];
    if (!firstRow) throw new Error('expected first row');
    const giftMax = firstRow.expires_at;
    // baseEnd > giftMax → use baseEnd
    const baseEnd = giftMax + 10 * 86400000;
    const r1 = await grantDays(db, {
      userId: 'u1',
      days: 5,
      sourceKind: 'admin',
      sourceId: 'admin_a:1',
      baseEnd,
    });
    expect(r1.granted_at).toBe(baseEnd);
    // baseEnd < giftMax of the new max → use giftMax
    const row1 = rows[1];
    if (!row1) throw new Error('expected row[1]');
    const newGiftMax = row1.expires_at;
    const r2 = await grantDays(db, {
      userId: 'u1',
      days: 3,
      sourceKind: 'admin',
      sourceId: 'admin_a:2',
      baseEnd: Date.now(),
    });
    expect(r2.granted_at).toBe(newGiftMax);
  });
});

describe('getCurrentMaxGiftExpiresAt', () => {
  it('returns 0 when user has no active grant', async () => {
    const { db } = makeFakeDb();
    expect(await getCurrentMaxGiftExpiresAt(db, 'u1', Date.now())).toBe(0);
  });

  it('returns max expires_at across multiple active grants', async () => {
    const { db, rows } = makeFakeDb();
    await grantDays(db, {
      userId: 'u1',
      days: 30,
      sourceKind: 'campaign',
      sourceId: 'a',
    });
    await grantDays(db, {
      userId: 'u1',
      days: 5,
      sourceKind: 'admin',
      sourceId: 'admin_1:t1',
    });
    const maxExpected = Math.max(...rows.map((r) => r.expires_at));
    expect(await getCurrentMaxGiftExpiresAt(db, 'u1', Date.now())).toBe(maxExpected);
  });
});
