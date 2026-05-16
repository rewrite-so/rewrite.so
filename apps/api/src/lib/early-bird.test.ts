import { describe, expect, it } from 'vitest';
import { resolveEarlyBirdSnapshot } from './early-bird.ts';

interface Fixture {
  partRow: { joined_at: number } | null;
  udRow: { status: string; pro_lapses_at: number | null; expires_at: number | null } | null;
  giftRow: { m: number | null };
}

function makeDb(fx: Fixture): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM campaign_participations cp')) return fx.partRow;
          if (sql.includes('FROM user_discounts')) return fx.udRow;
          if (sql.includes('FROM gift_grants')) return fx.giftRow;
          return null;
        },
        run: async () => ({ success: true, meta: { changes: 0 } }),
        all: async () => ({ results: [], success: true }),
      }),
    }),
  } as unknown as D1Database;
}

describe('resolveEarlyBirdSnapshot', () => {
  it('non-participant: snapshot=null, giftBalanceDays=0', async () => {
    const r = await resolveEarlyBirdSnapshot(
      makeDb({ partRow: null, udRow: null, giftRow: { m: null } }),
      'u1',
    );
    expect(r.snapshot).toBeNull();
    expect(r.giftBalanceDays).toBe(0);
  });

  it('non-participant but has active gift_grants from admin → snapshot=null, gift days reported', async () => {
    const future = Date.now() + 15 * 86400000;
    const r = await resolveEarlyBirdSnapshot(
      makeDb({ partRow: null, udRow: null, giftRow: { m: future } }),
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
        giftRow: { m: Date.now() + 90 * 86400000 },
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
        giftRow: { m: null },
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
        giftRow: { m: null },
      }),
      'u1',
    );
    expect(r.snapshot?.discountActive).toBe(false);
  });
});
