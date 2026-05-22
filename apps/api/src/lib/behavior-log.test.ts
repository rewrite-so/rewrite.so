import { afterEach, describe, expect, it, vi } from 'vitest';
import { type BehaviorEventRow, writeBehaviorEvents } from './behavior-log.ts';

const DAY_MS = 86_400_000;

function makeRow(over: Partial<BehaviorEventRow> = {}): BehaviorEventRow {
  return {
    ts: Date.now(),
    eventName: 'page_view',
    subjectKind: 'visitor',
    subjectIdHash: 'abcdef0123456789',
    sessionId: 'sid-1',
    page: '/try',
    locale: 'en',
    referrerHost: undefined,
    utmSource: undefined,
    utmMedium: undefined,
    utmCampaign: undefined,
    country: undefined,
    deviceType: undefined,
    tier: 'anon',
    site: undefined,
    propsJson: undefined,
    ...over,
  };
}

/** Recording D1 fake: prepare once, bind per row, batch captures bound args. */
function makeRecordingDB() {
  const binds: unknown[][] = [];
  let batchCalls = 0;
  const db = {
    prepare: (_sql: string) => ({
      bind: (...args: unknown[]) => ({ __args: args }) as unknown as D1PreparedStatement,
    }),
    batch: async (stmts: Array<{ __args: unknown[] }>) => {
      batchCalls++;
      for (const s of stmts) binds.push(s.__args);
      return stmts.map(() => ({ success: true }));
    },
  } as unknown as D1Database;
  return { db, binds, batchCalls: () => batchCalls };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('writeBehaviorEvents', () => {
  it('inserts a batch of rows in a single db.batch call', async () => {
    const { db, binds, batchCalls } = makeRecordingDB();
    await writeBehaviorEvents(db, [
      makeRow({ eventName: 'page_view' }),
      makeRow({ eventName: 'cta_click' }),
      makeRow({ eventName: 'signin_success' }),
    ]);
    expect(batchCalls()).toBe(1);
    expect(binds).toHaveLength(3);
    // bind order: ts, event_name, subject_kind, subject_id_hash, session_id, ...
    expect(binds.map((b) => b[1])).toEqual(['page_view', 'cta_click', 'signin_success']);
    expect(binds[0]?.[2]).toBe('visitor'); // subject_kind
    expect(binds[0]?.[4]).toBe('sid-1'); // session_id
    expect(binds[0]).toHaveLength(17); // 16 columns + created_at
  });

  it('maps undefined optional fields to null', async () => {
    const { db, binds } = makeRecordingDB();
    await writeBehaviorEvents(db, [
      makeRow({ subjectIdHash: undefined, sessionId: undefined, country: undefined }),
    ]);
    expect(binds[0]?.[3]).toBeNull(); // subject_id_hash
    expect(binds[0]?.[4]).toBeNull(); // session_id
    expect(binds[0]?.[11]).toBeNull(); // country
  });

  it('no-op when db is undefined', async () => {
    await expect(writeBehaviorEvents(undefined, [makeRow()])).resolves.toBeUndefined();
  });

  it('no-op when rows is empty — db.batch never called', async () => {
    const { db, batchCalls } = makeRecordingDB();
    await writeBehaviorEvents(db, []);
    expect(batchCalls()).toBe(0);
  });

  it('swallows a db.batch rejection — never throws', async () => {
    const db = {
      prepare: () => ({ bind: () => ({}) }),
      batch: async () => {
        throw new Error('d1 down');
      },
    } as unknown as D1Database;
    await expect(writeBehaviorEvents(db, [makeRow()])).resolves.toBeUndefined();
  });

  it('clamps a future-dated ts to created_at + 5 min', async () => {
    const now = 1_800_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { db, binds } = makeRecordingDB();
    await writeBehaviorEvents(db, [makeRow({ ts: now + 10 * DAY_MS })]);
    expect(binds[0]?.[0]).toBe(now + 5 * 60 * 1000);
  });

  it('clamps an ancient ts to created_at - 24h', async () => {
    const now = 1_800_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { db, binds } = makeRecordingDB();
    await writeBehaviorEvents(db, [makeRow({ ts: 0 })]);
    expect(binds[0]?.[0]).toBe(now - DAY_MS);
  });

  it('keeps an in-window ts unchanged', async () => {
    const now = 1_800_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { db, binds } = makeRecordingDB();
    await writeBehaviorEvents(db, [makeRow({ ts: now - 1000 })]);
    expect(binds[0]?.[0]).toBe(now - 1000);
  });
});
