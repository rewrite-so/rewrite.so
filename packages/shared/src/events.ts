/**
 * Web user-behavior events — whitelist & shared zod schema.
 *
 * Privacy contract (mirrors apps/api/src/lib/metrics.ts):
 * - No prompt / output / raw IP / email / API key may ever appear in props.
 * - Stricter prop validation (forbidden key substrings, value length caps,
 *   nested object rejection) lives in apps/api/src/lib/event-metrics.ts
 *   so the API rejects invalid payloads even if client SDK drifts.
 *
 * EVENT_NAMES is closed: new names must be added here first, then plumbed
 * through writeEventPoint / clients.
 */
import { z } from 'zod';

export const EVENT_NAMES = [
  // ---- Page traffic ----
  'page_view',
  // ---- Landing / /try interactions ----
  'cta_click', // props: { cta: 'install'|'signin'|'try_demo'|'pricing'|'github' }
  'try_input', // props: { length_bucket, lang } — never the text itself
  'try_select_candidate', // props: { style, position: 1|2|3, was_regen: 0|1 }
  'try_regenerate', // props: { style }
  'try_copy_result',
  // ---- Settings ----
  'settings_change', // props: { field: 'targetLang'|'uiLocale'|'triggerEnabled', is_custom?: 0|1 }
  // ---- Auth / conversion ----
  'signin_attempt', // props: { method: 'google'|'magiclink' }
  'signin_success', // props: { method, linked_visitor_id } — sole visitor→user anchor
  'signout',
  // ---- Subscription / BYOK (emitted server-side from webhook/me, no visitor_id) ----
  'checkout_start', // props: { plan: 'monthly'|'yearly' } — sent from web sender (carries visitor_id + UTM)
  'subscription_paid', // props: { plan } — emitted server-side from webhook
  'subscription_canceled',
  'byok_save', // props: { has_been_set_before: 0|1 } — never the key
  // ---- Campaigns / promotions ----
  'campaign_join', // props: { campaign_slug, campaign_type } — emitted server-side from POST /v1/campaigns/:slug/join
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && (EVENT_NAMES as readonly string[]).includes(value);
}

/**
 * Hard limits enforced on both client SDK and server route.
 * Server applies extra forbidden-key checks; client-side these caps are the
 * first line of defense against accidentally enqueueing oversized props.
 */
export const EVENT_LIMITS = {
  MAX_EVENTS_PER_REQUEST: 20,
  MAX_PROPS_KEYS: 8,
  MAX_PROP_STRING_LENGTH: 50,
  MAX_PROPS_JSON_BYTES: 200,
} as const;

/**
 * Per-event payload schema (client-side enqueue + server-side initial parse).
 *
 * `props` is intentionally narrow: only string | number leaf values are
 * permitted. Nested objects, arrays, booleans, and nulls are rejected here so
 * the strict server-side `validateEventProps` does not need to recurse.
 */
export const EventPayloadSchema = z.object({
  name: z.enum(EVENT_NAMES as readonly [EventName, ...EventName[]]),
  ts: z.number().int().nonnegative(),
  page: z.string().max(200),
  locale: z.string().min(2).max(10),
  referrer_host: z.string().max(200).optional(),
  utm: z
    .object({
      source: z.string().max(100).optional(),
      medium: z.string().max(100).optional(),
      campaign: z.string().max(100).optional(),
    })
    .optional(),
  visitor_id: z.string().min(1).max(64).optional(),
  device_type: z.enum(['mobile', 'desktop', 'tablet']).optional(),
  props: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export type EventPayload = z.infer<typeof EventPayloadSchema>;

/** POST /v1/events request body */
export const EventsBatchSchema = z.object({
  events: z.array(EventPayloadSchema).min(1).max(EVENT_LIMITS.MAX_EVENTS_PER_REQUEST),
});

export type EventsBatch = z.infer<typeof EventsBatchSchema>;
