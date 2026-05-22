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
import { type BehaviorEventRow, writeBehaviorEvents } from '../lib/behavior-log.ts';
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

  // Optional session — anonymous is fine. ban-check middleware is deliberately
  // NOT mounted on this route (see comment in index.ts). Ban exists to keep
  // banned users from spending paid quota; it does not have to silence them
  // from analytics. A banned user reaching this point keeps a real session
  // and lands in events with subjectKind='user' + their hashed user id, the
  // same as any other logged-in caller. Operations can still segment "events
  // from banned users" by JOIN-ing the user_bans table on the hash.
  const sessionUser = await getOrResolveSessionUser(c);
  const userId = sessionUser?.id;

  // Tier resolution for logged-in users:
  //   pro  → resolveUserTier returns 'pro' (any active / paused / canceled-
  //          but-still-in-period subscription)
  //   byok → free in subscription terms, but has a BYOK key configured
  //   free → no subscription, no BYOK key
  //
  // The extra byok_keys lookup keeps the events `tier` field consistent
  // with both the EventTier union ('anon'|'free'|'pro'|'byok') and with
  // me.ts byok_save events, which tag the same cohort as 'byok'. Without
  // it, BYOK users' /v1/events rows land as 'free' while their byok_save
  // row lands as 'byok' — segmentation queries on `blob10` would miss them.
  let tier: EventTier = 'anon';
  if (userId) {
    const resolved = await resolveUserTier(c.env.DB, userId, c.env.KV);
    if (resolved === 'pro') {
      tier = 'pro';
    } else {
      const hasByok = await c.env.DB.prepare('SELECT 1 FROM byok_keys WHERE user_id = ? LIMIT 1')
        .bind(userId)
        .first<{ 1: number }>();
      tier = hasByok ? 'byok' : 'free';
    }
  }

  // CF auto-populated geo (free, no extra request)
  const country = (c.req.raw.cf as { country?: string } | undefined)?.country ?? '';

  // Build per-event metrics. Pre-validate props before any hashing so a bad
  // event short-circuits the whole batch without burning crypto cycles.
  type PreparedEvent = {
    metric: Omit<EventMetric, 'subjectIdHash'>;
    subjectKind: EventSubjectKind;
    subjectRaw: string | undefined;
    /** D1-only fields — not part of the AE EventMetric. */
    ts: number;
    sessionId: string | undefined;
  };
  const prepared: PreparedEvent[] = [];
  for (const ev of events) {
    // Top-level string fields ride directly into AE blobs without going through
    // validateEventProps, so they must be checked here. A malicious client could
    // otherwise smuggle PII into page / referrer_host / utm.* / visitor_id —
    // the zod schema only caps their length, not their content.
    const topFieldChecks: Array<
      [
        string,
        'page' | 'referrer_host' | 'visitor_id' | 'session_id' | 'install_id' | 'utm',
        string | undefined,
      ]
    > = [
      ['page', 'page', ev.page],
      ['referrer_host', 'referrer_host', ev.referrer_host],
      ['visitor_id', 'visitor_id', ev.visitor_id],
      ['session_id', 'session_id', ev.session_id],
      ['install_id', 'install_id', ev.install_id],
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

    // Subject priority: logged-in cookie session > extension install_id >
    // web visitor_id > no id. A logged-in extension user proxies through the SW
    // with the .rewrite.so cookie, so they land as 'user' here (auto-merged
    // with their web activity), even though the SDK still sends install_id.
    //
    // Unlike /v1/rewrite, this route does NOT gate install_id behind
    // EXTENSION_ALLOWED_ORIGINS — deliberate: events are non-billing analytics
    // on their own rate-limit bucket, and install_id is client-forgeable anyway.
    let subjectKind: EventSubjectKind;
    let subjectRaw: string | undefined;
    if (userId) {
      subjectKind = 'user';
      subjectRaw = userId;
    } else if (ev.install_id) {
      subjectKind = 'install';
      subjectRaw = ev.install_id;
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
        site: ev.site,
        tier,
        subjectKind,
        propsJson: propsResult.json || undefined,
      },
      subjectKind,
      subjectRaw,
      ts: ev.ts,
      sessionId: ev.session_id,
    });
  }

  // Resolve subject id hashes once — shared by the AE write and the D1 mirror
  // (sha-256 is ~50us per call, < 1ms even for max-size batches). allSettled
  // (not all): a single hashSubjectId rejection from a misbehaving
  // crypto.subtle degrades that one event to an empty hash rather than
  // poisoning the batch — the event is still recorded.
  const hashes = await Promise.allSettled(
    prepared.map((p) => hashSubjectId(p.subjectKind, p.subjectRaw)),
  );

  // AE write (sampled aggregate store) — awaited before 202 so the response
  // means "every write attempted". writeEventPoint is self-protecting.
  // The same loop collects the D1 mirror rows.
  const behaviorRows: BehaviorEventRow[] = prepared.map((p, i) => {
    const h = hashes[i];
    const subjectIdHash = h?.status === 'fulfilled' ? h.value : undefined;
    writeEventPoint(c.env.EVENTS, { ...p.metric, subjectIdHash });
    return {
      ts: p.ts,
      eventName: p.metric.eventName,
      subjectKind: p.subjectKind,
      subjectIdHash,
      sessionId: p.sessionId,
      page: p.metric.pagePath,
      locale: p.metric.locale,
      referrerHost: p.metric.referrerHost,
      utmSource: p.metric.utm?.source,
      utmMedium: p.metric.utm?.medium,
      utmCampaign: p.metric.utm?.campaign,
      country: p.metric.country || undefined,
      deviceType: p.metric.deviceType,
      tier: p.metric.tier,
      site: p.metric.site,
      propsJson: p.metric.propsJson,
    };
  });

  // D1 mirror (precise, unsampled per-entity source of truth). Off the
  // response path via waitUntil; writeBehaviorEvents never throws, so the
  // test-env fallback (no executionCtx) is a safe floating promise.
  try {
    c.executionCtx.waitUntil(writeBehaviorEvents(c.env.DB, behaviorRows));
  } catch {
    void writeBehaviorEvents(c.env.DB, behaviorRows);
  }

  return c.json({}, 202);
});
