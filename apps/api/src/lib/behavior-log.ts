/**
 * D1 writer for behavior_events — the precise, unsampled mirror of the
 * web_events Analytics Engine dataset.
 *
 * Fire-and-forget contract (mirrors event-metrics.ts:writeEventPoint):
 * - Never throws. A telemetry write must not disrupt the user request.
 * - No-op when `db` is missing (local wrangler dev without the binding) or
 *   `rows` is empty.
 * - Privacy: stores only the same neutral fields as AE — no raw text / PII.
 *   props_json is kept for server-side logic but never surfaced to clients.
 *
 * See migration 0011_behavior_analytics.sql for the column contract.
 */
import { log } from './log.ts';

/**
 * Client `ts` is untrusted (EventPayloadSchema only checks `ts >= 0`). Clamp
 * it to a sane window around the server insert time so a skewed client clock
 * cannot poison timeline ordering. All retention / bucketing analysis uses
 * the server `created_at` column, never this value.
 */
const TS_PAST_CLAMP_MS = 24 * 60 * 60 * 1000;
const TS_FUTURE_CLAMP_MS = 5 * 60 * 1000;

export interface BehaviorEventRow {
  /** Client event ts (epoch ms); clamped near created_at before insert. */
  ts: number;
  eventName: string;
  subjectKind: string;
  subjectIdHash: string | undefined;
  sessionId: string | undefined;
  page: string;
  locale: string;
  referrerHost: string | undefined;
  utmSource: string | undefined;
  utmMedium: string | undefined;
  utmCampaign: string | undefined;
  country: string | undefined;
  deviceType: string | undefined;
  tier: string;
  site: string | undefined;
  propsJson: string | undefined;
}

function clampTs(ts: number, createdAt: number): number {
  if (!Number.isFinite(ts)) return createdAt;
  const min = createdAt - TS_PAST_CLAMP_MS;
  const max = createdAt + TS_FUTURE_CLAMP_MS;
  if (ts < min) return min;
  if (ts > max) return max;
  return ts;
}

const INSERT_SQL = `INSERT INTO behavior_events
  (ts, event_name, subject_kind, subject_id_hash, session_id, page, locale,
   referrer_host, utm_source, utm_medium, utm_campaign, country, device_type,
   tier, site, props_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Batch-insert a /v1/events batch into D1. One round trip for the whole
 * batch (≤ MAX_EVENTS_PER_REQUEST rows). Caller should fire this through
 * executionCtx.waitUntil so it stays off the response path.
 */
export async function writeBehaviorEvents(
  db: D1Database | undefined,
  rows: readonly BehaviorEventRow[],
): Promise<void> {
  if (!db || rows.length === 0) return;
  try {
    const createdAt = Date.now();
    const stmt = db.prepare(INSERT_SQL);
    const batch = rows.map((r) =>
      stmt.bind(
        clampTs(r.ts, createdAt),
        r.eventName,
        r.subjectKind,
        r.subjectIdHash ?? null,
        r.sessionId ?? null,
        r.page,
        r.locale,
        r.referrerHost ?? null,
        r.utmSource ?? null,
        r.utmMedium ?? null,
        r.utmCampaign ?? null,
        r.country ?? null,
        r.deviceType ?? null,
        r.tier,
        r.site ?? null,
        r.propsJson ?? null,
        createdAt,
      ),
    );
    await db.batch(batch);
  } catch (err) {
    // intentional: telemetry never disrupts the request path
    log.warn('behavior_log.write_failed', { err: String(err).slice(0, 200) });
  }
}
