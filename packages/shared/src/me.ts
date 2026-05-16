/**
 * `/v1/me` response schema — single source of truth shared by the web app,
 * extension service worker, and api route handler.
 *
 * Extensions and web both depend on this shape; adding/removing fields must
 * happen in lockstep with the parsers in
 * apps/extension/src/background/service-worker.ts and apps/web settings UI.
 */
import { z } from 'zod';

export const SubscriptionSummarySchema = z.object({
  plan: z.string(),
  status: z.string(),
  /** ISO timestamp */
  currentPeriodEnd: z.string(),
  cancelAtPeriodEnd: z.boolean(),
});

export type SubscriptionSummary = z.infer<typeof SubscriptionSummarySchema>;

/**
 * Early-bird status snapshot used by /billing banner + /settings card.
 *
 * - `isParticipant`: 用户是否报名过早鸟活动（曾在 campaign_participations 表中）
 * - `discountActive`: user_discounts.status='active'（包含 60 天宽限期内）。
 *   checkout 路径会按此决定是否注入折扣码
 * - `proLapsesAt`: 「按当前已知信息，不再订阅则在此时间彻底失去 Pro 资格」。
 *   ISO 字符串。仅参与了早鸟且尚未失效时非空；用户可见，用于 banner 提示
 */
export const EarlyBirdSnapshotSchema = z.object({
  isParticipant: z.boolean(),
  discountActive: z.boolean(),
  proLapsesAt: z.string().nullable(),
});

export type EarlyBirdSnapshot = z.infer<typeof EarlyBirdSnapshotSchema>;

/**
 * GET /v1/me 完整 response。
 *
 * 未登录时 user / subscription / earlyBird 都返 null；giftBalanceDays
 * 返 0；eventsEnabled 仍透传（匿名 sender 启停依赖此字段）。
 */
export const MeResponseSchema = z.object({
  user: z
    .object({
      id: z.string(),
      email: z.string(),
      name: z.string().nullable().optional(),
      image: z.string().nullable().optional(),
    })
    .nullable(),
  tier: z.enum(['free', 'pro']).optional(),
  subscription: SubscriptionSummarySchema.nullable(),
  /** Snapshot of early-bird participation; null when not participant */
  earlyBird: EarlyBirdSnapshotSchema.nullable(),
  /** Remaining gift Pro days = max(0, ceil((max(expires_at) - now) / 1d)). 0 when no active grant */
  giftBalanceDays: z.number().int().nonnegative(),
  eventsEnabled: z.boolean(),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;
