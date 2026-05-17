import { describe, expect, it } from 'vitest';
import { resolveEarlyBirdSnapshot } from './early-bird.ts';

interface Fixture {
  partRow: { joined_at: number } | null;
  udRow: { status: string; pro_lapses_at: number | null; expires_at: number | null } | null;
  giftMaxRow: { m: number | null };
  pendingGiftRow: { granted_at: number; expires_at: number; days: number } | null;
}

/**
 * Fake D1 supporting db.batch([prepare(...).bind(...), ...]) — matches the
 * 4 queries in resolveEarlyBirdSnapshot by SQL substring and returns the
 * fixture row inside `{ results: [...] }`. Order of returned array matches
 * batch input order. Each prepare().bind() returns an object the batch
 * implementation will identify by its captured SQL.
 */
function makeDb(fx: Fixture): D1Database {
  const stmt = (sql: string) => ({
    __sql: sql,
    bind: (..._args: unknown[]) => ({ __sql: sql }),
  });
  return {
    prepare: stmt,
    batch: async (stmts: Array<{ __sql: string }>) =>
      stmts.map((s) => {
        if (s.__sql.includes('FROM campaign_participations cp')) {
          return { results: fx.partRow ? [fx.partRow] : [], success: true };
        }
        if (s.__sql.includes('FROM user_discounts')) {
          return { results: fx.udRow ? [fx.udRow] : [], success: true };
        }
        if (s.__sql.includes('SELECT MAX(expires_at)')) {
          return { results: [fx.giftMaxRow], success: true };
        }
        if (s.__sql.includes('granted_at, expires_at, days')) {
          return { results: fx.pendingGiftRow ? [fx.pendingGiftRow] : [], success: true };
        }
        return { results: [], success: true };
      }),
  } as unknown as D1Database;
}

describe('resolveEarlyBirdSnapshot', () => {
  it('non-participant: snapshot=null, giftBalanceDays=0', async () => {
    const r = await resolveEarlyBirdSnapshot(
      makeDb({
        partRow: null,
        udRow: null,
        giftMaxRow: { m: null },
        pendingGiftRow: null,
      }),
      'u1',
    );
    expect(r.snapshot).toBeNull();
    expect(r.giftBalanceDays).toBe(0);
  });

  it('non-participant but has active gift_grants from admin → snapshot=null, gift days reported', async () => {
    const future = Date.now() + 15 * 86400000;
    const r = await resolveEarlyBirdSnapshot(
      makeDb({
        partRow: null,
        udRow: null,
        giftMaxRow: { m: future },
        pendingGiftRow: null,
      }),
      'u1',
    );
    expect(r.snapshot).toBeNull();
    expect(r.giftBalanceDays).toBeGreaterThanOrEqual(14);
    expect(r.giftBalanceDays).toBeLessThanOrEqual(15);
  });

  it('participant with active discount: isParticipant=true, discountActive=true, proLapsesAt ISO present', async () => {
    const future = Date.now() + 150 * 86400000;
    const r = await resolveEarlyBirdSnapshot(
      makeDb({
        partRow: { joined_at: Date.now() - 1000 },
        udRow: { status: 'active', pro_lapses_at: future, expires_at: null },
        giftMaxRow: { m: Date.now() + 90 * 86400000 },
        pendingGiftRow: null,
      }),
      'u1',
    );
    expect(r.snapshot?.isParticipant).toBe(true);
    expect(r.snapshot?.discountActive).toBe(true);
    expect(r.snapshot?.proLapsesAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.giftBalanceDays).toBeGreaterThan(0);
  });

  it('participant with status=expired discount: isParticipant=true, discountActive=false', async () => {
    const r = await resolveEarlyBirdSnapshot(
      makeDb({
        partRow: { joined_at: Date.now() - 1000 },
        udRow: { status: 'expired', pro_lapses_at: 1000, expires_at: null },
        giftMaxRow: { m: null },
        pendingGiftRow: null,
      }),
      'u1',
    );
    expect(r.snapshot?.isParticipant).toBe(true);
    expect(r.snapshot?.discountActive).toBe(false);
  });

  it('participant with expires_at in the past: discountActive=false (lazy-on-read by resolveActiveDiscount, /v1/me reads status)', async () => {
    const past = Date.now() - 1000;
    const r = await resolveEarlyBirdSnapshot(
      makeDb({
        partRow: { joined_at: Date.now() - 1000 },
        udRow: { status: 'active', pro_lapses_at: Date.now() + 1000, expires_at: past },
        giftMaxRow: { m: null },
        pendingGiftRow: null,
      }),
      'u1',
    );
    expect(r.snapshot?.discountActive).toBe(false);
  });

  // ===== pendingGift cases =====

  it('participant with NO pending gift (普通早鸟，granted_at=now) → pendingGift=null', async () => {
    // granted_at <= now in SQL is filtered out by `granted_at > ?` → empty results
    const giftEnd = Date.now() + 90 * 86400000;
    const r = await resolveEarlyBirdSnapshot(
      makeDb({
        partRow: { joined_at: Date.now() - 1000 },
        udRow: { status: 'active', pro_lapses_at: Date.now() + 150 * 86400000, expires_at: null },
        giftMaxRow: { m: giftEnd },
        pendingGiftRow: null, // SQL filter eliminates already-activated gifts
      }),
      'u1',
    );
    expect(r.snapshot?.pendingGift).toBeNull();
    expect(r.giftBalanceDays).toBeGreaterThanOrEqual(89);
  });

  it('participant with pending gift (报名时已 Pro, granted_at=sub_end in future) → pendingGift={days,activatesAt,expiresAt}', async () => {
    const subEnd = Date.now() + 25 * 86400000;
    const giftExpires = subEnd + 90 * 86400000;
    const r = await resolveEarlyBirdSnapshot(
      makeDb({
        partRow: { joined_at: Date.now() - 1000 },
        udRow: { status: 'active', pro_lapses_at: giftExpires + 60 * 86400000, expires_at: null },
        giftMaxRow: { m: giftExpires },
        pendingGiftRow: { granted_at: subEnd, expires_at: giftExpires, days: 90 },
      }),
      'u1',
    );
    expect(r.snapshot?.pendingGift).not.toBeNull();
    expect(r.snapshot?.pendingGift?.days).toBe(90);
    expect(r.snapshot?.pendingGift?.activatesAt).toBe(new Date(subEnd).toISOString());
    expect(r.snapshot?.pendingGift?.expiresAt).toBe(new Date(giftExpires).toISOString());
    // giftBalanceDays counts FROM now (not from gift activation), includes the
    // sub_end wait time + gift period → roughly 115 days
    expect(r.giftBalanceDays).toBeGreaterThanOrEqual(114);
    expect(r.giftBalanceDays).toBeLessThanOrEqual(116);
  });

  it('stacked grants: pendingGift uses earliest granted_at row, giftBalanceDays is MAX(expires_at) aggregate', async () => {
    // Scenario: admin compensation 30 days starting in 10 days, plus early-bird
    // 90 days starting in 25 days (after sub_end). pendingGift should pick the
    // earlier-to-activate row (admin's 30d); giftBalanceDays should reflect the
    // later expiry (early-bird's expires_at).
    const adminStart = Date.now() + 10 * 86400000;
    const adminEnd = adminStart + 30 * 86400000;
    const earlyBirdStart = Date.now() + 25 * 86400000;
    const earlyBirdEnd = earlyBirdStart + 90 * 86400000;
    const r = await resolveEarlyBirdSnapshot(
      makeDb({
        partRow: { joined_at: Date.now() - 1000 },
        udRow: { status: 'active', pro_lapses_at: earlyBirdEnd + 60 * 86400000, expires_at: null },
        giftMaxRow: { m: earlyBirdEnd }, // SQL MAX picks early-bird (later)
        pendingGiftRow: { granted_at: adminStart, expires_at: adminEnd, days: 30 }, // SQL ASC picks admin (earlier)
      }),
      'u1',
    );
    // pendingGift = admin row (first to activate)
    expect(r.snapshot?.pendingGift?.days).toBe(30);
    expect(r.snapshot?.pendingGift?.activatesAt).toBe(new Date(adminStart).toISOString());
    // giftBalanceDays = MAX expiry days from now = ~115 (25 + 90)
    expect(r.giftBalanceDays).toBeGreaterThanOrEqual(114);
    expect(r.giftBalanceDays).toBeLessThanOrEqual(116);
  });

  it('uses db.batch() (single round-trip) — fixture batch call count == 1', async () => {
    let batchCalls = 0;
    const db = {
      prepare: (sql: string) => ({ __sql: sql, bind: (..._a: unknown[]) => ({ __sql: sql }) }),
      batch: async (stmts: Array<{ __sql: string }>) => {
        batchCalls += 1;
        // returns 4 empty result sets matching the 4 statements
        return stmts.map(() => ({ results: [], success: true }));
      },
    } as unknown as D1Database;
    await resolveEarlyBirdSnapshot(db, 'u1');
    expect(batchCalls).toBe(1);
  });
});
