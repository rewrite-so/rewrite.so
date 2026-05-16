import { describe, expect, it } from 'vitest';
import { extendProLapsesAt, resolveActiveDiscount } from './user-discounts.ts';

interface DiscountRow {
  user_id: string;
  code: string;
  percentage: number;
  duration: 'forever' | 'once' | 'repeating';
  pro_lapses_at: number | null;
  expires_at: number | null;
  grace_period_days: number;
  status: 'active' | 'expired' | 'revoked';
  valid_from: number;
}

const MS_PER_DAY = 86_400_000;

function makeFakeDb(initialRows: DiscountRow[] = []): {
  db: D1Database;
  rows: DiscountRow[];
} {
  const rows: DiscountRow[] = initialRows.map((r) => ({ ...r }));
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT code, percentage, duration')) {
            const [userId] = args as [string];
            const matches = rows
              .filter((r) => r.user_id === userId && r.status === 'active')
              .sort((a, b) => b.valid_from - a.valid_from);
            const r = matches[0];
            if (!r) return null;
            return {
              code: r.code,
              percentage: r.percentage,
              duration: r.duration,
              pro_lapses_at: r.pro_lapses_at,
              expires_at: r.expires_at,
            };
          }
          return null;
        },
        run: async () => {
          if (sql.startsWith('UPDATE user_discounts') && sql.includes("status='expired'")) {
            const [_now, userId] = args as [number, string];
            for (const r of rows) {
              if (r.user_id === userId && r.status === 'active') {
                r.status = 'expired';
              }
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.startsWith('UPDATE user_discounts') && sql.includes('SET pro_lapses_at = MAX')) {
            const [newEnd, msPerDay, _now, userId] = args as [number, number, number, string];
            for (const r of rows) {
              if (r.user_id === userId && r.status === 'active') {
                const target = newEnd + r.grace_period_days * msPerDay;
                r.pro_lapses_at = Math.max(r.pro_lapses_at ?? 0, target);
              }
            }
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

function makeRow(overrides: Partial<DiscountRow> = {}): DiscountRow {
  return {
    user_id: 'u1',
    code: 'EARLYBIRD_LIFETIME_70OFF',
    percentage: 70,
    duration: 'forever',
    pro_lapses_at: Date.now() + 150 * MS_PER_DAY, // 报名后 150 天
    expires_at: null,
    grace_period_days: 60,
    status: 'active',
    valid_from: Date.now(),
    ...overrides,
  };
}

describe('resolveActiveDiscount', () => {
  it('returns null when no active discount row exists', async () => {
    const { db } = makeFakeDb([]);
    expect(await resolveActiveDiscount(db, 'u1')).toBeNull();
  });

  it('returns the active discount within pro_lapses_at window', async () => {
    const { db } = makeFakeDb([makeRow()]);
    const r = await resolveActiveDiscount(db, 'u1');
    expect(r).not.toBeNull();
    expect(r?.code).toBe('EARLYBIRD_LIFETIME_70OFF');
    expect(r?.percentage).toBe(70);
    expect(r?.duration).toBe('forever');
  });

  it('lazy-on-read: writes status=expired and returns null when pro_lapses_at has passed', async () => {
    const past = Date.now() - 1000;
    const { db, rows } = makeFakeDb([makeRow({ pro_lapses_at: past })]);
    const r = await resolveActiveDiscount(db, 'u1');
    expect(r).toBeNull();
    expect(rows[0]?.status).toBe('expired');
  });

  it('lazy-on-read: writes status=expired when expires_at has passed (duration != forever)', async () => {
    const past = Date.now() - 1000;
    const { db, rows } = makeFakeDb([makeRow({ duration: 'once', expires_at: past })]);
    expect(await resolveActiveDiscount(db, 'u1')).toBeNull();
    expect(rows[0]?.status).toBe('expired');
  });

  it('returns null without writing when status is already expired', async () => {
    const { db, rows } = makeFakeDb([makeRow({ status: 'expired' })]);
    expect(await resolveActiveDiscount(db, 'u1')).toBeNull();
    expect(rows[0]?.status).toBe('expired'); // unchanged
  });

  it('pro_lapses_at IS NULL → treats as active (no lapse computed yet)', async () => {
    // 用户报名后从未订阅过 → 报名时设置了 pro_lapses_at = gift.expires_at + grace；
    // 仍在 active 窗口内。但若 pro_lapses_at NULL（极端情况，例如 admin 手工写
    // 跳过 trigger 计算），lazy check 不应误判过期。
    const { db } = makeFakeDb([makeRow({ pro_lapses_at: null })]);
    const r = await resolveActiveDiscount(db, 'u1');
    expect(r).not.toBeNull();
  });
});

describe('extendProLapsesAt', () => {
  it('pushes pro_lapses_at forward monotonically; never retreats', async () => {
    const now = Date.now();
    const { db, rows } = makeFakeDb([makeRow({ pro_lapses_at: now + 30 * MS_PER_DAY })]);

    // 新事件 newEnd = now + 5d → target = now + 5d + 60d = now + 65d > 当前 30d → 更新
    await extendProLapsesAt(db, 'u1', now + 5 * MS_PER_DAY);
    expect(rows[0]?.pro_lapses_at).toBe(now + 65 * MS_PER_DAY);

    // 后续事件 newEnd = now + 1d → target = now + 1d + 60d = now + 61d < 当前 65d → 不变
    await extendProLapsesAt(db, 'u1', now + 1 * MS_PER_DAY);
    expect(rows[0]?.pro_lapses_at).toBe(now + 65 * MS_PER_DAY);

    // 更大事件 newEnd = now + 90d → target = now + 150d > 65d → 推进
    await extendProLapsesAt(db, 'u1', now + 90 * MS_PER_DAY);
    expect(rows[0]?.pro_lapses_at).toBe(now + 150 * MS_PER_DAY);
  });

  it('no-op when no user_discounts row exists (UPDATE 0 rows)', async () => {
    const { db, rows } = makeFakeDb([]);
    await extendProLapsesAt(db, 'u_nonexistent', Date.now() + 30 * MS_PER_DAY);
    expect(rows).toEqual([]);
  });

  it('only touches status=active rows (expired stays expired)', async () => {
    const { db, rows } = makeFakeDb([makeRow({ status: 'expired', pro_lapses_at: 1000 })]);
    await extendProLapsesAt(db, 'u1', Date.now() + 30 * MS_PER_DAY);
    expect(rows[0]?.pro_lapses_at).toBe(1000);
    expect(rows[0]?.status).toBe('expired');
  });
});
