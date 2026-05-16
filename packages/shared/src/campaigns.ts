/**
 * Campaigns — 通用运营活动数据契约。
 *
 * 早鸟、礼品卡、推广码等都通过 `campaigns` 表 + `campaign_participations`
 * 表统一表达。每个 campaign 有 `type`（决定 config_json schema）+ `slug`
 * （URL-safe 唯一标识）+ `enabled` + 时间窗 + capacity + 类型化 config +
 * 多语言 i18n_json（admin 可改文案无需发版）。
 *
 * 本文件 export 的所有 schema 同时被 api（写 D1 + 校验 admin 写入）与
 * admin（写表前校验）import；保持单一来源。
 */
import { z } from 'zod';

// ----------------------------------------------------------------------------
// Campaign type enum
// ----------------------------------------------------------------------------

/**
 * 当前支持的活动类型。新增类型需同时：
 * 1. 在此扩 CampaignType union
 * 2. 添加对应的 Config schema（如 GiftCardConfigSchema）
 * 3. 在 `getCampaignConfigSchema()` 加 dispatch 分支
 * 4. 前端 admin SPA + 主站营销页加对应渲染
 */
export const CAMPAIGN_TYPES = ['early_bird'] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];
export const CampaignTypeSchema = z.enum(CAMPAIGN_TYPES);

// ----------------------------------------------------------------------------
// Early Bird config
// ----------------------------------------------------------------------------

/**
 * Early Bird 活动配置。落库到 `campaigns.config_json` 字段。
 *
 * - `perks.gift_days`：报名即赠送 N 天 Pro（写入 gift_grants 表）
 * - `perks.discount.code`：必须与 Creem dashboard 上的折扣码完全一致（人工同步）
 * - `perks.discount.percentage`：1-99，例 70 = 70% off = 中文「3 折」（用户付 30%）
 * - `perks.discount.duration`：`forever` = 终生折扣
 * - `perks.discount.grace_period_days`：用户 Pro 资格丢失后允许「无 Pro 但仍享 3 折」的恢复窗口
 *
 * 命名警示：discount.code 用 `*_70OFF`（业界标准 = 70% off）而非
 * `*_30PCT` / `*_3FOLD`。Creem dashboard / API / log 全部用 percentage（70）。
 * 中文文案侧的「3 折」转换（100 - 70）只在前端 i18n 字符串里完成。
 */
export const EarlyBirdConfigSchema = z.object({
  perks: z.object({
    gift_days: z.number().int().positive(),
    discount: z.object({
      code: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[A-Z0-9_]+$/, 'code must be UPPER_SNAKE_CASE alphanumeric'),
      percentage: z.number().int().min(1).max(99),
      duration: z.enum(['forever', 'once', 'repeating']),
      grace_period_days: z.number().int().positive(),
    }),
  }),
  /** Phase 1 恒为 true（产品决策）。预留字段供未来匿名活动用 */
  require_login: z.literal(true),
});

export type EarlyBirdConfig = z.infer<typeof EarlyBirdConfigSchema>;

// ----------------------------------------------------------------------------
// I18n schema（campaigns.i18n_json）
// ----------------------------------------------------------------------------

/**
 * 每个 locale 下的营销文案字段集。admin SPA 表单与前端 page.tsx 读取的
 * key 必须对齐，所以 schema 化避免 typo / 字段漂移。
 *
 * 同 packages/shared/src/i18n.ts 的 SUPPORTED_LOCALES，但此处是「文案
 * locale」（不含 'auto'，因为活动文案必须实落到某个具体语言）。
 */
export const SUPPORTED_CAMPAIGN_LOCALES = ['en', 'zh-CN', 'ja', 'ko', 'es', 'fr', 'de'] as const;
export type CampaignLocale = (typeof SUPPORTED_CAMPAIGN_LOCALES)[number];

export const CampaignLocalizedTextSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(400).optional(),
  heroBody: z.string().max(2000).optional(),
  perksTitle: z.string().max(200).optional(),
  ctaText: z.string().max(60).optional(),
});

export type CampaignLocalizedText = z.infer<typeof CampaignLocalizedTextSchema>;

/**
 * i18n_json 形状：每个支持的 locale 都必须有完整的 localized text。
 * `en` 是 fallback locale，必填；其它 locale 缺失时前端 fallback 到 en。
 * 这里 schema 仅强约束 `en`，其它 locale 可选，由 CI i18n:validate 在
 * production 部署前补齐。
 */
export const CampaignI18nSchema = z.object({
  en: CampaignLocalizedTextSchema,
  'zh-CN': CampaignLocalizedTextSchema.optional(),
  ja: CampaignLocalizedTextSchema.optional(),
  ko: CampaignLocalizedTextSchema.optional(),
  es: CampaignLocalizedTextSchema.optional(),
  fr: CampaignLocalizedTextSchema.optional(),
  de: CampaignLocalizedTextSchema.optional(),
});

export type CampaignI18n = z.infer<typeof CampaignI18nSchema>;

// ----------------------------------------------------------------------------
// Top-level campaign envelope（admin POST/PATCH 接收）
// ----------------------------------------------------------------------------

export const CampaignSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase kebab-case');

/**
 * Admin 写表时传的 payload schema。type-specific config_json 二次校验由
 * `getCampaignConfigSchema(type).parse(config_json)` 在 route handler 里做。
 */
export const CampaignWriteSchema = z.object({
  type: CampaignTypeSchema,
  slug: CampaignSlugSchema,
  enabled: z.boolean(),
  /**
   * Marketing visibility toggle (orthogonal to `enabled`). When true the
   * homepage Hero + TopNav show the campaign entry; when false those
   * surfaces hide it but URL direct-access still serves the active
   * campaign. Default false so newly-created campaigns don't accidentally
   * appear on the homepage. See CLAUDE.md "运营活动契约".
   */
  show_homepage_badge: z.boolean().default(false),
  starts_at: z.number().int().nonnegative(),
  ends_at: z.number().int().nonnegative(),
  capacity: z.number().int().positive().nullable(),
  /** raw object; secondary parse by getCampaignConfigSchema(type) */
  config_json: z.record(z.string(), z.unknown()),
  i18n_json: CampaignI18nSchema,
});

export type CampaignWrite = z.infer<typeof CampaignWriteSchema>;

/**
 * 按 type dispatch 到具体 config schema。新增 type 时此处加一个 case。
 */
export function getCampaignConfigSchema(type: CampaignType): z.ZodTypeAny {
  switch (type) {
    case 'early_bird':
      return EarlyBirdConfigSchema;
    default: {
      // 编译期 exhaustive check；未来加新 type 时 TS 会报错提示
      const _exhaustive: never = type;
      throw new Error(`Unknown campaign type: ${_exhaustive}`);
    }
  }
}

// ----------------------------------------------------------------------------
// Read API response shape（GET /v1/campaigns/:slug）
// ----------------------------------------------------------------------------

/**
 * 公开端点返回的活动信息。`viewer` 仅在请求带有效 session 时出现。
 */
export const CampaignPublicViewSchema = z.object({
  slug: CampaignSlugSchema,
  type: CampaignTypeSchema,
  enabled: z.boolean(),
  show_homepage_badge: z.boolean(),
  starts_at: z.number().int().nonnegative(),
  ends_at: z.number().int().nonnegative(),
  capacity: z.number().int().positive().nullable(),
  /** Server-side parse 后的 type-specific config（不暴露原始 raw） */
  config: z.record(z.string(), z.unknown()),
  i18n: CampaignI18nSchema,
  viewer: z
    .object({
      joined: z.boolean(),
      joinedAt: z.number().int().nonnegative().nullable(),
    })
    .optional(),
});

export type CampaignPublicView = z.infer<typeof CampaignPublicViewSchema>;
