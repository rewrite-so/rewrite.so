/**
 * POST /v1/events — web user-behavior ingest.
 *
 * Privacy & cost contracts (see plan + CLAUDE.md "用户行为分析"):
 * - Zero plaintext: prop validation rejects forbidden keys, oversized values,
 *   nested objects, and control characters. The shared EventPayloadSchema
 *   already narrows props to string|number leaves, but we defense-in-depth
 *   in apps/api/src/lib/event-metrics.ts so the binary written to AE cannot
 *   carry content even if a future schema drift slips through.
 * - Anonymous unless authenticated: any session is honored, but the route
 *   itself never requires login. Server backfills tier / country / hashed
 *   subject id so the client cannot lie about them.
 * - Rate limit is its own DO bucket ('events:ip:<hashed>'), kept separate
 *   from the rewrite ip bucket so a noisy logger does not consume rewrite
 *   reserves (and vice versa).
 * - Kill switch: EVENTS_DISABLED='1' short-circuits to 204 before any DO /
 *   AE call; flips with `wrangler deploy` (< 30s) instead of redeploying
 *   code.
 *
 * Anything we cannot derive deterministically (visitor_id, page path, utm)
 * lives on the client and is trusted as-is — but each field is length-capped
 * by EventPayloadSchema first, and forbidden-key / forbidden-value-char
 * checks ensure even a malicious client cannot smuggle content through.
 */
import { EventsBatchSchema } from '@rewrite/shared';
import { Hono } from 'hono';
import { consumeEventsIp } from '../do/rate-limiter.ts';
import {
  type EventMetric,
  type EventSubjectKind,
  type EventTier,
  hashSubjectId,
  validateEventProps,
  validateTopLevelField,
  writeEventPoint,
} from '../lib/event-metrics.ts';
import { log } from '../lib/log.ts';
import { hashIp, resolveUserTier } from '../lib/quota.ts';
import { getOrResolveSessionUser } from '../lib/session-cache.ts';
import type { AppEnv, Bindings } from '../types.ts';

export const eventsRoute = new Hono<AppEnv>();

export function isEventsDisabled(env: Bindings): boolean {
  return env.EVENTS_DISABLED === '1';
}

eventsRoute.post('/v1/events', async (c) => {
  // Kill switch first — no DO call, no AE write, no body parsing cost.
  if (isEventsDisabled(c.env)) return c.body(null, 204);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const parsed = EventsBatchSchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload' }, 400);
  }
  const { events } = parsed.data;

  // Rate limit by hashed IP (daily salt rotation already baked into hashIp).
  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0';
  const ipHash = await hashIp(ip, c.env.BETTER_AUTH_SECRET);
  const burst = await consumeEventsIp(c.env.RATE_LIMITER, ipHash);
  if (!burst.allowed) {
    return c.json({ error: 'rate_limit', retryAfterMs: burst.retryAfterMs }, 429, {
      'retry-after': String(Math.ceil(burst.retryAfterMs / 1000)),
    });
  }

  // Optional session — anonymous is fine. ban-check middleware is NOT mounted
  // on this route (see comment in index.ts); banned users degrade silently to
  // 'visitor' kind via the session-cache returning null after auth refusal.
  const sessionUser = await getOrResolveSessionUser(c);
  const userId = sessionUser?.id;

  // tier resolution: only paid one D1 read for logged-in users
  let tier: EventTier = 'anon';
  if (userId) {
    const resolved = await resolveUserTier(c.env.DB, userId, c.env.KV);
    tier = resolved === 'pro' ? 'pro' : 'free';
  }

  // CF auto-populated geo (free, no extra request)
  const country = (c.req.raw.cf as { country?: string } | undefined)?.country ?? '';

  // Build per-event metrics. Pre-validate props before any hashing so a bad
  // event short-circuits the whole batch without burning crypto cycles.
  type PreparedEvent = {
    metric: Omit<EventMetric, 'subjectIdHash'>;
    subjectKind: EventSubjectKind;
    subjectRaw: string | undefined;
  };
  const prepared: PreparedEvent[] = [];
  for (const ev of events) {
    // Top-level string fields ride directly into AE blobs without going through
    // validateEventProps, so they must be checked here. A malicious client could
    // otherwise smuggle PII into page / referrer_host / utm.* / visitor_id —
    // the zod schema only caps their length, not their content.
    const topFieldChecks: Array<
      [string, 'page' | 'referrer_host' | 'visitor_id' | 'utm', string | undefined]
    > = [
      ['page', 'page', ev.page],
      ['referrer_host', 'referrer_host', ev.referrer_host],
      ['visitor_id', 'visitor_id', ev.visitor_id],
      ['utm.source', 'utm', ev.utm?.source],
      ['utm.medium', 'utm', ev.utm?.medium],
      ['utm.campaign', 'utm', ev.utm?.campaign],
    ];
    for (const [fieldName, rule, value] of topFieldChecks) {
      const r = validateTopLevelField(rule, value);
      if (!r.ok) {
        log.warn('events.invalid_field', { field: fieldName, reason: r.error, name: ev.name });
        return c.json({ error: 'invalid_field', field: fieldName, reason: r.error }, 400);
      }
    }

    const propsResult = validateEventProps(ev.props);
    if (!propsResult.ok) {
      // Strict: a single bad event fails the whole batch. The client gets a
      // 400 and can drop the offending payload before retrying — preferable
      // to silently dropping events without telling the SDK.
      log.warn('events.invalid_props', { reason: propsResult.error, name: ev.name });
      return c.json({ error: 'invalid_props', reason: propsResult.error }, 400);
    }

    let subjectKind: EventSubjectKind;
    let subjectRaw: string | undefined;
    if (userId) {
      subjectKind = 'user';
      subjectRaw = userId;
    } else if (ev.visitor_id) {
      subjectKind = 'visitor';
      subjectRaw = ev.visitor_id;
    } else {
      subjectKind = 'anonymous_no_id';
      subjectRaw = undefined;
    }

    prepared.push({
      metric: {
        eventName: ev.name,
        pagePath: ev.page,
        locale: ev.locale,
        referrerHost: ev.referrer_host,
        utm: ev.utm,
        country,
        deviceType: ev.device_type,
        tier,
        subjectKind,
        propsJson: propsResult.json || undefined,
      },
      subjectKind,
      subjectRaw,
    });
  }

  // Resolve subject id hashes in parallel; sha-256 is ~50us per call so this
  // adds < 1ms even for max-size batches. Doing it inline (rather than under
  // waitUntil) keeps writeEventPoint truly synchronous — important so the
  // 202 response means "we tried to write" rather than "we promised to try".
  //
  // allSettled (not all): a single hashSubjectId rejection must not poison
  // the other events in the batch. writeEventPoint is already self-protecting
  // (event-metrics.ts swallows writeDataPoint errors), so this only guards
  // against a misbehaving crypto.subtle in the hash step. Anything that
  // throws here still degrades to "this one event silently dropped".
  await Promise.allSettled(
    prepared.map(async (p) => {
      const subjectIdHash = await hashSubjectId(p.subjectKind, p.subjectRaw);
      writeEventPoint(c.env.EVENTS, { ...p.metric, subjectIdHash });
    }),
  );

  return c.json({}, 202);
});
