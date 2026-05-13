/**
 * Webhook routeEvent 行为测试（端到端，含签名校验路径）。
 *
 * Fixture 基于实测 evt_6zB7KdtiwxUvGg8tu8KUV5 raw payload，字段命名严格 snake_case
 * + 带 _date 后缀 + 无 cancel_at_period_end，与 Creem OpenAPI / 真实 webhook payload
 * 一致。来源：
 * - https://docs.creem.io/api-reference/openapi.json SubscriptionEntity
 * - docs.creem.io/llms-full.txt subscription.* sample payloads
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/auth.ts', () => ({
  createAuth: () => ({
    api: { getSession: async () => null },
    handler: async () => new Response('mock', { status: 200 }),
  }),
}));

const app = (await import('../index.ts')).app;

const WEBHOOK_SECRET = 'whsec_test';

async function sign(body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const fakeRateLimiter = {} as unknown as DurableObjectNamespace;
const fakeKV = {} as unknown as KVNamespace;

interface DBWrite {
  kind: 'INSERT' | 'UPDATE';
  bindings: unknown[];
  sql: string;
}

function makeDB(
  opts: {
    existingSubId?: string;
    existingEventId?: string;
    /**
     * Stored current_period_end for the existing subscription row, used by
     * the period-advancement dedupe in upsertSubscriptionFromObject. Default
     * picks a value *less than* the fixture's period_end so an UPDATE counts
     * as a renewal; set this to the fixture's exact period_end to simulate
     * an active+paid race where the second event sees no advancement.
     */
    existingPeriodEnd?: number;
  } = {},
): {
  db: D1Database;
  writes: DBWrite[];
  insertedEventIds: string[];
} {
  const writes: DBWrite[] = [];
  const insertedEventIds: string[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM webhook_events')) {
            return opts.existingEventId && args[0] === opts.existingEventId
              ? { event_id: opts.existingEventId }
              : null;
          }
          if (sql.includes('FROM subscriptions')) {
            return opts.existingSubId && args[0] === opts.existingSubId
              ? {
                  id: 'existing-row',
                  current_period_end: opts.existingPeriodEnd ?? Date.parse('2025-01-01T00:00:00Z'),
                }
              : null;
          }
          return null;
        },
        run: async () => {
          if (sql.includes('INSERT INTO subscriptions')) {
            writes.push({ kind: 'INSERT', bindings: args, sql });
          } else if (sql.includes('UPDATE subscriptions')) {
            writes.push({ kind: 'UPDATE', bindings: args, sql });
          } else if (sql.includes('INSERT INTO webhook_events')) {
            insertedEventIds.push(args[0] as string);
          }
          return { success: true };
        },
        all: async () => ({ results: [], success: true }),
      }),
    }),
  } as unknown as D1Database;
  return { db, writes, insertedEventIds };
}

type RecordedEvent = { indexes: string[]; blobs: string[]; doubles: number[] };

function makeEnv(db: D1Database) {
  return {
    OPENAI_BASE_URL: 'https://upstream.test/v1',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-4o-mini',
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'http://localhost',
    RESEND_API_KEY: '',
    RESEND_FROM_EMAIL: '',
    CREEM_API_KEY: 'creem_test_key',
    CREEM_PRO_MONTHLY_PRODUCT_ID: 'prod_73ACZ2NZIHA19RsFPYm5ae',
    CREEM_PRO_YEARLY_PRODUCT_ID: 'prod_yearly',
    CREEM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    WEB_ORIGIN: 'https://rewrite.so',
    DB: db,
    KV: fakeKV,
    RATE_LIMITER: fakeRateLimiter,
  } as const;
}

/**
 * Wraps makeEnv with a recording EVENTS binding so tests can assert on
 * subscription_paid / subscription_canceled writeEventPoint calls.
 */
function makeEnvWithEvents(
  db: D1Database,
  opts: { eventsDisabled?: boolean } = {},
): {
  env: ReturnType<typeof makeEnv> & { EVENTS: AnalyticsEngineDataset };
  eventsWritten: RecordedEvent[];
} {
  const eventsWritten: RecordedEvent[] = [];
  const EVENTS = {
    writeDataPoint: (p: RecordedEvent) => {
      eventsWritten.push(p);
    },
  } as unknown as AnalyticsEngineDataset;
  return {
    env: {
      ...makeEnv(db),
      EVENTS,
      ...(opts.eventsDisabled ? { EVENTS_DISABLED: '1' } : {}),
    } as ReturnType<typeof makeEnv> & { EVENTS: AnalyticsEngineDataset },
    eventsWritten,
  };
}

/** 基于实测 SubscriptionEntity 的最小必要字段 fixture */
function subFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_2jpgISCbTZv3UTlnMQkGl3',
    object: 'subscription',
    status: 'active',
    customer: { id: 'cust_1DzCe9OZUnwLBIB8YjCHPj', email: 'lin@tell.st' },
    product: { id: 'prod_73ACZ2NZIHA19RsFPYm5ae' },
    current_period_start_date: '2026-05-10T07:53:01.371Z',
    current_period_end_date: '2026-06-10T07:53:00.420Z',
    canceled_at: null,
    metadata: { plan: 'monthly', user_id: 'joALmu5aCupEwAZ0hI3M3V1pdfZmsxTP' },
    mode: 'prod',
    ...overrides,
  };
}

function envelope(eventType: string, object: unknown, id = 'evt_test') {
  return {
    id,
    eventType,
    created_at: 1778399582427,
    object,
  };
}

async function postWebhook(payload: object, env: ReturnType<typeof makeEnv>): Promise<Response> {
  const body = JSON.stringify(payload);
  const sig = await sign(body);
  return app.request(
    '/webhooks/creem',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'creem-signature': sig },
      body,
    },
    env,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('routeEvent — subscription event mapping', () => {
  it('A: subscription.paid first issuance → INSERT with status=active, period from _date fields', async () => {
    const { db, writes, insertedEventIds } = makeDB();
    const res = await postWebhook(envelope('subscription.paid', subFixture()), makeEnv(db));
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.kind).toBe('INSERT');
    // INSERT bindings 顺序见 webhook.ts upsertSubscriptionFromObject INSERT SQL：
    //   id, user_id, creem_subscription_id, creem_customer_id, product_id, plan,
    //   status, current_period_start, current_period_end, cancel_at_period_end,
    //   created_at, updated_at
    const b = writes[0]?.bindings ?? [];
    expect(b[0]).toBe('sub_2jpgISCbTZv3UTlnMQkGl3'); // id
    expect(b[1]).toBe('joALmu5aCupEwAZ0hI3M3V1pdfZmsxTP'); // user_id
    expect(b[5]).toBe('monthly'); // plan
    expect(b[6]).toBe('active'); // status
    expect(b[7]).toBe(Date.parse('2026-05-10T07:53:01.371Z')); // 1778399581371
    expect(b[8]).toBe(Date.parse('2026-06-10T07:53:00.420Z')); // 1781077980420
    expect(b[9]).toBe(0); // cancel_at_period_end=0
    expect(insertedEventIds).toEqual(['evt_test']);
  });

  it('B: subscription.paid renewal (existing row) → UPDATE not INSERT', async () => {
    const { db, writes } = makeDB({ existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' });
    const res = await postWebhook(envelope('subscription.paid', subFixture()), makeEnv(db));
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.kind).toBe('UPDATE');
    // UPDATE bindings: status, plan, product_id, customer_id, period_start, period_end, cancel_at_period_end, updated_at, sub_id (WHERE)
    const b = writes[0]?.bindings ?? [];
    expect(b[0]).toBe('active');
    expect(b[5]).toBe(Date.parse('2026-06-10T07:53:00.420Z')); // 续费 period_end 推进
  });

  it('C: subscription.update with object.status=active → UPDATE active, no cancel flag', async () => {
    const { db, writes } = makeDB({ existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' });
    const res = await postWebhook(
      envelope('subscription.update', subFixture({ status: 'active' })),
      makeEnv(db),
    );
    expect(res.status).toBe(200);
    expect(writes[0]?.kind).toBe('UPDATE');
    expect(writes[0]?.bindings[0]).toBe('active');
    expect(writes[0]?.bindings[6]).toBe(0); // cancel_at_period_end=0
  });

  it('D: subscription.update with object.status=scheduled_cancel → UPDATE active + cancel flag', async () => {
    const { db, writes } = makeDB({ existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' });
    const res = await postWebhook(
      envelope('subscription.update', subFixture({ status: 'scheduled_cancel' })),
      makeEnv(db),
    );
    expect(res.status).toBe(200);
    expect(writes[0]?.bindings[0]).toBe('active'); // 让 resolveUserTier 仍认 pro
    expect(writes[0]?.bindings[6]).toBe(1); // cancel_at_period_end=1
  });

  it('E: subscription.canceled → status=canceled, cancel flag=0', async () => {
    const { db, writes } = makeDB({ existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' });
    const res = await postWebhook(envelope('subscription.canceled', subFixture()), makeEnv(db));
    expect(res.status).toBe(200);
    expect(writes[0]?.bindings[0]).toBe('canceled');
    expect(writes[0]?.bindings[6]).toBe(0);
  });

  it('F: subscription.scheduled_cancel → status=active, cancel flag=1 (UI shows ends-on)', async () => {
    const { db, writes } = makeDB({ existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' });
    const res = await postWebhook(
      envelope('subscription.scheduled_cancel', subFixture({ status: 'scheduled_cancel' })),
      makeEnv(db),
    );
    expect(res.status).toBe(200);
    expect(writes[0]?.bindings[0]).toBe('active');
    expect(writes[0]?.bindings[6]).toBe(1);
  });

  it('G: subscription.past_due → status=past_due', async () => {
    const { db, writes } = makeDB({ existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' });
    const res = await postWebhook(envelope('subscription.past_due', subFixture()), makeEnv(db));
    expect(res.status).toBe(200);
    expect(writes[0]?.bindings[0]).toBe('past_due');
  });

  it('H: subscription.expired ignores object.status=active and writes status=expired', async () => {
    // Critical regression: Creem sample shows expired event still has object.status="active".
    // We must derive D1 status from eventType, not object.status.
    const { db, writes } = makeDB({ existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' });
    const res = await postWebhook(
      envelope('subscription.expired', subFixture({ status: 'active' })),
      makeEnv(db),
    );
    expect(res.status).toBe(200);
    expect(writes[0]?.bindings[0]).toBe('expired');
  });

  it('I: subscription.active still works (regression guard)', async () => {
    const { db, writes } = makeDB();
    const res = await postWebhook(envelope('subscription.active', subFixture()), makeEnv(db));
    expect(res.status).toBe(200);
    expect(writes[0]?.kind).toBe('INSERT');
    expect(writes[0]?.bindings[6]).toBe('active');
  });

  it('J: missing metadata.user_id → no DB write (skip with warn)', async () => {
    const { db, writes, insertedEventIds } = makeDB();
    const sub = subFixture({ metadata: {} });
    const res = await postWebhook(envelope('subscription.paid', sub), makeEnv(db));
    expect(res.status).toBe(200);
    // upsertSubscriptionFromObject 返 false → 不 INSERT/UPDATE，但 webhook handler 仍写幂等键
    expect(writes).toHaveLength(0);
    expect(insertedEventIds).toEqual(['evt_test']);
  });

  it('K: unhandled eventType throws → 500 + no webhook_events idempotency row', async () => {
    // 行为变更：未识别事件不再 default-warn-then-write-idempotency。改为 throw 让
    // Creem 自动重试，给运维 4 次重试窗口去识别新事件类型扩 CreemEventType union。
    // 来源：docs.creem.io/llms-full.txt 行 2445 + 5663 (retry policy 30s/1min/5min/1h)
    const { db, writes, insertedEventIds } = makeDB();
    const res = await postWebhook(
      envelope('subscription.future_unknown_event' as string, subFixture()),
      makeEnv(db),
    );
    expect(res.status).toBe(500);
    expect(writes).toHaveLength(0); // 没落 subscriptions
    expect(insertedEventIds).toEqual([]); // 关键：没写幂等键，Creem 会 retry
  });

  it('L: informational checkout.completed → 200, no subscriptions write, but writes idempotency', async () => {
    // 区别于 unhandled：informational 是已知不需要落 subscriptions 表的事件
    // （subscription.* 才是真理）。显式列入 noop case + 写幂等键避免 Creem 持续重试
    // 一个我们故意不处理的事件。
    const { db, writes, insertedEventIds } = makeDB();
    const res = await postWebhook(
      envelope('checkout.completed', { id: 'ck_x', status: 'completed' }),
      makeEnv(db),
    );
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(0);
    expect(insertedEventIds).toEqual(['evt_test']); // 幂等键写了
  });
});

describe('routeEvent — web event emission', () => {
  it('subscription.paid emits one subscription_paid web event with plan + user subject', async () => {
    const { db } = makeDB();
    const { env, eventsWritten } = makeEnvWithEvents(db);
    const res = await postWebhook(envelope('subscription.paid', subFixture()), env);
    expect(res.status).toBe(200);
    expect(eventsWritten).toHaveLength(1);
    const evt = eventsWritten[0];
    if (!evt) throw new Error('expected one event');
    expect(evt.indexes).toEqual(['subscription_paid']);
    // blob10 = tier, blob11 = subject_kind, blob12 = subject_id_hash, blob13 = event_props
    expect(evt.blobs[9]).toBe('pro');
    expect(evt.blobs[10]).toBe('user');
    expect(evt.blobs[11]).toMatch(/^[0-9a-f]{16}$/);
    expect(evt.blobs[12]).toContain('"plan":"monthly"');
  });

  it('subscription.canceled emits one subscription_canceled web event', async () => {
    const { db } = makeDB({ existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' });
    const { env, eventsWritten } = makeEnvWithEvents(db);
    const res = await postWebhook(envelope('subscription.canceled', subFixture()), env);
    expect(res.status).toBe(200);
    expect(eventsWritten).toHaveLength(1);
    expect(eventsWritten[0]?.indexes).toEqual(['subscription_canceled']);
  });

  it('subscription.expired emits subscription_canceled (eventType drives event, not object.status)', async () => {
    const { db } = makeDB({ existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' });
    const { env, eventsWritten } = makeEnvWithEvents(db);
    const res = await postWebhook(envelope('subscription.expired', subFixture()), env);
    expect(res.status).toBe(200);
    expect(eventsWritten[0]?.indexes).toEqual(['subscription_canceled']);
  });

  it('subscription.past_due / paused / scheduled_cancel / update do NOT emit web events', async () => {
    const cases = [
      { type: 'subscription.past_due', existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' },
      { type: 'subscription.paused', existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' },
      { type: 'subscription.scheduled_cancel', existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' },
      { type: 'subscription.update', existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3' },
    ];
    for (const c of cases) {
      const { db } = makeDB({ existingSubId: c.existingSubId });
      const { env, eventsWritten } = makeEnvWithEvents(db);
      const res = await postWebhook(envelope(c.type, subFixture(), `evt_${c.type}`), env);
      expect(res.status).toBe(200);
      expect(eventsWritten, `${c.type} should not emit events`).toHaveLength(0);
    }
  });

  it('EVENTS_DISABLED=1 short-circuits emission even on subscription.paid', async () => {
    const { db } = makeDB();
    const { env, eventsWritten } = makeEnvWithEvents(db, { eventsDisabled: true });
    const res = await postWebhook(envelope('subscription.paid', subFixture()), env);
    expect(res.status).toBe(200);
    expect(eventsWritten).toHaveLength(0);
  });

  it('renewal (UPDATE with advanced period_end) emits subscription_paid once', async () => {
    // Existing row has period_end set well before the fixture's period_end →
    // the upsert sees a period advance and should emit subscription_paid.
    const { db } = makeDB({
      existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3',
      existingPeriodEnd: Date.parse('2026-04-10T07:53:00.420Z'),
    });
    const { env, eventsWritten } = makeEnvWithEvents(db);
    const res = await postWebhook(envelope('subscription.paid', subFixture()), env);
    expect(res.status).toBe(200);
    expect(eventsWritten).toHaveLength(1);
    expect(eventsWritten[0]?.indexes).toEqual(['subscription_paid']);
  });

  it('same-period upsert (active+paid race or verify+webhook dup) emits only once', async () => {
    // Existing row already at the fixture's period_end → no advancement; the
    // second event in the active/paid race or webhook-after-verify dup must
    // silently skip the web event so funnel ratios stay 1:1 per period.
    const fixtureEndMs = Date.parse('2026-06-10T07:53:00.420Z');
    const { db } = makeDB({
      existingSubId: 'sub_2jpgISCbTZv3UTlnMQkGl3',
      existingPeriodEnd: fixtureEndMs,
    });
    const { env, eventsWritten } = makeEnvWithEvents(db);
    const res = await postWebhook(envelope('subscription.paid', subFixture()), env);
    expect(res.status).toBe(200);
    expect(eventsWritten).toHaveLength(0);
  });

  it('writeDataPoint that throws must NOT take down the webhook (fire-and-forget)', async () => {
    // Telemetry failure on a webhook would 500 the route, skip writing the
    // idempotency key, and trigger a Creem retry storm. writeEventPoint is
    // already self-protecting, but this asserts the contract.
    const { db } = makeDB();
    const throwingEvents = {
      writeDataPoint: () => {
        throw new Error('AE outage');
      },
    } as unknown as AnalyticsEngineDataset;
    const env = { ...makeEnv(db), EVENTS: throwingEvents } as ReturnType<typeof makeEnv> & {
      EVENTS: AnalyticsEngineDataset;
    };
    const res = await postWebhook(envelope('subscription.paid', subFixture()), env);
    expect(res.status).toBe(200);
  });

  it('hashSubjectId failure must NOT take down the webhook either', async () => {
    // The other half of the emit path: hashSubjectId is async crypto.subtle
    // and could in principle reject. With the try/catch around the emit body
    // a rejection drops the event silently and the webhook still 200s.
    vi.doMock('../lib/event-metrics.ts', async () => {
      const actual =
        await vi.importActual<typeof import('../lib/event-metrics.ts')>('../lib/event-metrics.ts');
      return {
        ...actual,
        hashSubjectId: async () => {
          throw new Error('crypto.subtle.digest down');
        },
      };
    });
    // Force a fresh app instance that picks up the mock.
    vi.resetModules();
    const freshApp = (await import('../index.ts')).app;
    const { db } = makeDB();
    const { env, eventsWritten } = makeEnvWithEvents(db);
    const body = JSON.stringify(envelope('subscription.paid', subFixture()));
    const sig = await sign(body);
    const res = await freshApp.request(
      '/webhooks/creem',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'creem-signature': sig },
        body,
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(eventsWritten).toHaveLength(0); // emit was caught
    vi.doUnmock('../lib/event-metrics.ts');
    vi.resetModules();
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});
