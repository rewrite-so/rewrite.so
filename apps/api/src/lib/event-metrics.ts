/**
 * Cloudflare Analytics Engine writer for web user-behavior events.
 *
 * Privacy contract (mirrors lib/metrics.ts):
 * - Never write prompt / output / raw IP / email / API key
 * - All subject identifiers go through hashUserId(...) with explicit namespace
 * - props is JSON-stringified into blob13 ≤ 200 bytes; validation rejects
 *   forbidden keys, oversized values, nested objects, and control characters
 *
 * Field mapping (≤ 20 blobs / 20 doubles / 1 index — Cloudflare AE hard limit,
 * docs: https://developers.cloudflare.com/analytics/analytics-engine/limits/):
 *
 *   indexes: event_name
 *   blob1=event_name (duplicate of index for index-free ad-hoc queries)
 *   blob2=page_path     blob3=locale         blob4=referrer_host
 *   blob5=utm_source    blob6=utm_medium     blob7=utm_campaign
 *   blob8=country       blob9=device_type    blob10=tier
 *   blob11=subject_kind blob12=subject_id_hash
 *   blob13=event_props (JSON string)  blob14=site (扩展端粗粒度站点标签)
 *   blob15-20: reserved
 *   double1=value (numeric prop overflow, e.g. ms / count)
 *   double2-20: reserved
 */
import type { EventName } from '@rewrite/shared';
import { EVENT_LIMITS } from '@rewrite/shared';
import { hashUserId } from './metrics.ts';

export type EventTier = 'anon' | 'free' | 'pro' | 'byok';
export type EventSubjectKind = 'user' | 'visitor' | 'install' | 'anonymous_no_id';
export type EventDeviceType = 'mobile' | 'desktop' | 'tablet';

/**
 * Independent namespace for anonymous visitor ids so they never collide with
 * the user-id hash used in rewrite_requests / web_events 'user' rows.
 * Bumping this string invalidates historical visitor correlation.
 */
const VISITOR_HASH_NAMESPACE = 'visitor_v1:';

export interface EventMetric {
  eventName: EventName;
  pagePath: string;
  locale: string;
  referrerHost?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
  country?: string;
  deviceType?: EventDeviceType;
  /** 扩展端粗粒度站点标签（白名单 enum）；web 端事件为 undefined。落 blob14。 */
  site?: string;
  tier: EventTier;
  subjectKind: EventSubjectKind;
  /** Already-hashed (16 hex). Use hashSubjectId() to derive. */
  subjectIdHash?: string;
  /** Pre-serialized & validated JSON string (≤ 200 bytes). Use validateEventProps(). */
  propsJson?: string;
  /** Optional numeric extra (lands in double1). */
  value?: number;
}

/**
 * Derive subject_id hash with the right namespace for the kind.
 * - 'user'    → hashUserId(rawUserId), same formula as metrics.ts (cross-table JOIN-able)
 * - 'install' → hashUserId(rawInstallId), same formula as metrics.ts 'anonymous_install'
 *               (no extra namespace) so web_events install rows JOIN rewrite_requests
 * - 'visitor' → hashUserId(VISITOR_HASH_NAMESPACE + rawVisitorId), independent namespace
 * - 'anonymous_no_id' → returns undefined; caller stores empty blob12
 */
export async function hashSubjectId(
  kind: EventSubjectKind,
  raw: string | undefined,
): Promise<string | undefined> {
  if (kind === 'anonymous_no_id' || !raw) return undefined;
  if (kind === 'user' || kind === 'install') return hashUserId(raw);
  return hashUserId(VISITOR_HASH_NAMESPACE + raw);
}

export type ValidatePropsResult = { ok: true; json: string } | { ok: false; error: string };

/**
 * Forbidden key substrings — anything we suspect could carry user content or PII.
 * Match is case-insensitive substring on the key name itself.
 */
const FORBIDDEN_KEY_SUBSTRINGS = [
  'text',
  'content',
  'prompt',
  'output',
  'email',
  'ip',
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
] as const;

/** Keys must match this regex (lowercase ASCII + underscore + digits). */
const KEY_REGEX = /^[a-z][a-z0-9_]*$/;

/** Strings must not contain control / escape / quote / brace / bracket / backslash chars. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: defense-in-depth: explicitly reject control chars in event props
const FORBIDDEN_VALUE_CHARS = /[\x00-\x1f\x7f"\\<>{}[\]]/;

/**
 * Per-field allow-list patterns for top-level event fields. These run *in
 * addition to* the zod length caps so a malicious or buggy client cannot
 * smuggle a query string (`?email=foo@x.com&apikey=sk-...`), CRLF injection,
 * or raw PII into page / referrer_host / utm / visitor_id.
 *
 * Choose narrow positive patterns rather than negative substring scans:
 * substring lists like FORBIDDEN_KEY_SUBSTRINGS over-flag legitimate routes
 * (e.g. /contact contains 'content'). The strings these fields can carry are
 * always machine-generated, so we can demand a strict character set.
 */
export const TOP_LEVEL_FIELD_RULES = {
  /** Path only — pathname is stripped of locale + query by the client SDK. */
  page: { max: 200, pattern: /^\/[A-Za-z0-9/_\-.]*$/ },
  /** Bare host (no path, no scheme); optional port suffix. */
  referrer_host: { max: 200, pattern: /^[A-Za-z0-9.-]+(?::\d+)?$/ },
  /** UUID v4 or short random id. */
  visitor_id: { max: 64, pattern: /^[A-Za-z0-9_-]+$/ },
  /** Per-session id — UUID v4 or short random id (same shape as visitor_id). */
  session_id: { max: 64, pattern: /^[A-Za-z0-9_-]+$/ },
  /** Extension install id — UUID v4 or short random id (same shape as visitor_id). */
  install_id: { max: 64, pattern: /^[A-Za-z0-9_-]+$/ },
  /** All utm_* tags share the same shape: marketing tooling normalises these. */
  utm: { max: 100, pattern: /^[A-Za-z0-9_\-.]+$/ },
} as const;

export type TopLevelFieldName = keyof typeof TOP_LEVEL_FIELD_RULES;

export type FieldValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validate a single top-level string field. Returns ok if undefined.
 *
 * The field name is the *rule* key (one of `'page' | 'referrer_host' |
 * 'visitor_id' | 'utm'`), not the source field's exact name — utm.source,
 * utm.medium, utm.campaign all share the 'utm' rule.
 */
export function validateTopLevelField(
  rule: TopLevelFieldName,
  value: string | undefined,
): FieldValidationResult {
  if (value === undefined || value.length === 0) return { ok: true };
  const spec = TOP_LEVEL_FIELD_RULES[rule];
  if (value.length > spec.max) return { ok: false, error: 'value_too_long' };
  if (!spec.pattern.test(value)) return { ok: false, error: 'invalid_format' };
  return { ok: true };
}

/**
 * Strict server-side validation. Returns the canonical JSON string ready to
 * stash in blob13, or an error code explaining why we rejected the payload.
 *
 * Even though the shared zod EventPayloadSchema rejects nested objects /
 * arrays / booleans at the type level, this function re-checks every leaf
 * because (a) the binary on AE side cannot be patched once written, (b) we
 * want a single source of truth that does not depend on zod version.
 */
export function validateEventProps(
  props: Record<string, unknown> | undefined,
): ValidatePropsResult {
  if (props === undefined) return { ok: true, json: '' };

  const keys = Object.keys(props);
  if (keys.length === 0) return { ok: true, json: '' };
  if (keys.length > EVENT_LIMITS.MAX_PROPS_KEYS) {
    return { ok: false, error: 'too_many_keys' };
  }

  for (const k of keys) {
    if (!KEY_REGEX.test(k)) return { ok: false, error: 'invalid_key_format' };
    const lower = k.toLowerCase();
    for (const banned of FORBIDDEN_KEY_SUBSTRINGS) {
      if (lower.includes(banned)) return { ok: false, error: 'forbidden_key' };
    }

    const v = props[k];
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return { ok: false, error: 'non_finite_number' };
      continue;
    }
    if (typeof v === 'string') {
      if (v.length > EVENT_LIMITS.MAX_PROP_STRING_LENGTH) {
        return { ok: false, error: 'value_too_long' };
      }
      if (FORBIDDEN_VALUE_CHARS.test(v)) {
        return { ok: false, error: 'forbidden_value_char' };
      }
      continue;
    }
    // Reject booleans, null, undefined, objects, arrays — see schema doc.
    return { ok: false, error: 'invalid_value_type' };
  }

  const json = JSON.stringify(props);
  // MAX_PROPS_JSON_BYTES is a byte cap. JS string `.length` is UTF-16 code
  // units, which understates byte size for non-ASCII (CJK = 3 bytes, emoji
  // = 4 bytes). Use TextEncoder so the limit holds for the values
  // FORBIDDEN_VALUE_CHARS doesn't reject (non-ASCII letters are fine).
  if (new TextEncoder().encode(json).byteLength > EVENT_LIMITS.MAX_PROPS_JSON_BYTES) {
    return { ok: false, error: 'props_json_too_large' };
  }

  return { ok: true, json };
}

/**
 * Fire-and-forget write to Analytics Engine. Never throws — failures here
 * must not surface to the user. Mirrors metrics.ts:writeRequestEvent contract.
 */
export function writeEventPoint(
  dataset: AnalyticsEngineDataset | undefined,
  metric: EventMetric,
): void {
  if (!dataset) return;

  try {
    dataset.writeDataPoint({
      indexes: [metric.eventName],
      blobs: [
        metric.eventName,
        metric.pagePath,
        metric.locale,
        metric.referrerHost ?? '',
        metric.utm?.source ?? '',
        metric.utm?.medium ?? '',
        metric.utm?.campaign ?? '',
        metric.country ?? '',
        metric.deviceType ?? '',
        metric.tier,
        metric.subjectKind,
        metric.subjectIdHash ?? '',
        metric.propsJson ?? '',
        metric.site ?? '',
      ],
      doubles: [metric.value ?? 0],
    });
  } catch {
    // intentional: telemetry never disrupts the request path
  }
}
