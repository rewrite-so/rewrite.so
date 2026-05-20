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
  'try_select_candidate', // props: { style } — regen/position 维度由 rewrite metrics 的 is_regen + try_regenerate 事件覆盖（候选恒按 faithful/casual/formal 固定顺序，position 与 style 冗余）
  'try_regenerate', // props: { style }
  'try_copy_result', // DEFERRED: /try 当前无独立"复制"动作（候选直接写回 textarea；Copy 按钮仅写入失败兜底时出现）
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
  // ---- Landing v2 funnel (added in PR-7) ----
  // `section_view` is wired via SectionViewMarker today. The four below are
  // declared up front so the whitelist is the single source of truth for the
  // funnel — their call sites land in a follow-up PR that adds the per-section
  // client handlers. Until then they are inert (whitelist entries do nothing
  // by themselves; nothing fires them).
  'section_view', // props: { section: 'hero'|'comparison'|'pricing'|'privacy'|'how'|'features' } — IntersectionObserver, per-pageview dedup
  'hero_demo_played', // props: { trigger: 'auto'|'manual', platform: 'X'|'Slack'|'Reddit'|'GitHub' } — DEFERRED: wiring lives in HomeRewriteDemo
  'compare_row_expand', // props: { row: 'inline'|'speed'|'candidates'|'logging'|'byok'|'multilang'|'openSource' } — DEFERRED: wiring lives in ComparisonTable details
  'pricing_card_focus', // props: { card: 'free'|'pro'|'byok' } — DEFERRED: hover or keyboard focus ≥ 500ms
  'early_bird_banner_click', // props: { surface: 'hero'|'pricing'|'nav' } — DEFERRED: wiring lives on EarlyBirdBadge + pricing banner
  // ---- Extension rewrite lifecycle (content script → SW → /v1/events) ----
  // 扩展端事件由 apps/extension content script 经 service-worker 代理发出，
  // 统一带 install_id + site（见 EventPayloadSchema）。匿名扩展用户 subjectKind='install'。
  'ext_trigger', // props: { has_selection: 0|1 } — 双击 Shift 真正发起一次改写
  'ext_accept', // props: { style } — 用户采纳某候选且写回成功
  'ext_regenerate', // props: { style } — 单卡 Regenerate ↻
  'ext_dismiss', // props: {} — 用户主动关闭浮窗（Esc / 取消按钮）未采纳。不含 error / 重新触发 等其它关闭路径；漏斗里 trigger − accept − dismiss = 这些"其它结局"
  // ---- Write-back layer telemetry (Plan v9: 渐进式降级到合成 paste + 反射 fallback) ----
  // props: { layer, framework } —— layer ∈ input_field | paste_strong | paste_weak |
  // lexical_fast | lexical_slow | draft_fast | draft_slow | dom_generic | silent_fail；
  // framework ∈ lexical | draft | prosemirror | slate | generic。由 packages/core 的
  // WriteLayer / Framework 类型同步定义。**绝不**带 text payload（CLAUDE.md「隐私与
  // 安全」段隐私底线）。仅监控写回降级链路真实分布、定位 mangle / framework 升级问题。
  'rewrite_write_layer',
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
 * 扩展端粗粒度站点白名单。隐私契约：扩展埋点**绝不**记录真实 URL / path,
 * 只发这个固定 enum；未识别站点一律归 'other'。新增站点同步更新
 * apps/extension/src/lib/site-detect.ts 的 hostname 映射。
 */
export const SITE_LABELS = [
  'reddit',
  'x',
  'slack',
  'notion',
  'github',
  'linkedin',
  'discord',
  'other',
] as const;
export type SiteLabel = (typeof SITE_LABELS)[number];

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
  /**
   * 扩展安装 ID（扩展端事件专用）。仅传输用：服务端据此推导 subjectKind='install'
   * 并 hash 落 subject_id blob，**不**单独占 AE blob。web 端事件不带此字段。
   */
  install_id: z.string().min(1).max(64).optional(),
  /** 扩展端粗粒度站点标签（白名单 enum，绝不含 URL/path）。web 端事件不带。 */
  site: z.enum(SITE_LABELS).optional(),
  device_type: z.enum(['mobile', 'desktop', 'tablet']).optional(),
  props: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export type EventPayload = z.infer<typeof EventPayloadSchema>;

/** POST /v1/events request body */
export const EventsBatchSchema = z.object({
  events: z.array(EventPayloadSchema).min(1).max(EVENT_LIMITS.MAX_EVENTS_PER_REQUEST),
});

export type EventsBatch = z.infer<typeof EventsBatchSchema>;
