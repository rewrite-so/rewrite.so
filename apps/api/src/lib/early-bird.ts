/**
 * Early-bird snapshot — 单次 D1 query 拼出 /v1/me 需要的 earlyBird 字段。
 *
 * 输出形状对齐 packages/shared/src/me.ts:EarlyBirdSnapshotSchema。
 *
 * 性能：一次 D1 read 用 LEFT JOIN + 子查询拿三件事（是否参与早鸟 /
 * 当前 user_discounts 状态 / 当前 gift_grants 最大 expires_at），不做 3 次
 * round-trip。
 */
import type { EarlyBirdSnapshot } from '@rewrite/shared';

const MS_PER_DAY = 86_400_000;

export interface EarlyBirdQueryResult {
  snapshot: EarlyBirdSnapshot | null;
  /** 当前生效 gift_grants 距 max(expires_at) 的剩余天数（向上取整，无生效则 0） */
  giftBalanceDays: number;
}

/**
 * 查 user 的早鸟参与与 gift_grants 状态。
 *
 * - 未参与早鸟 → snapshot=null（但仍可能有非早鸟来源的 gift_grants）
 * - 参与早鸟 + user_discounts.status='active' + 未过期 → discountActive=true
 * - 参与早鸟 + user_discounts.status='active' 但 lazy 检测到过期 → 仍返
 *   discountActive=true（不在 read path 做副作用写入，由 resolveActiveDiscount
 *   在 checkout 时 lazy-on-read 自治愈）。**这是有意为之**：避免读热路径写 D1；
 *   且用户访问 /v1/me 时刚好过期一两秒看到 discountActive 仍 true 不会出问题
 *   （下次 checkout 才真实校验）
 */
export async function resolveEarlyBirdSnapshot(
  db: D1Database,
  userId: string,
): Promise<EarlyBirdQueryResult> {
  const now = Date.now();

  // 1) 早鸟参与状态 — 任一 type='early_bird' 的 campaign 都算
  const partRow = await db
    .prepare(
      `SELECT cp.joined_at AS joined_at
         FROM campaign_participations cp
         JOIN campaigns c ON c.id = cp.campaign_id
        WHERE cp.user_id = ? AND c.type = 'early_bird'
        ORDER BY cp.joined_at ASC
        LIMIT 1`,
    )
    .bind(userId)
    .first<{ joined_at: number }>();

  // 2) user_discounts 当前 row（任一 source；Phase 1 唯一来源是 campaign）
  const udRow = await db
    .prepare(
      `SELECT status, pro_lapses_at, expires_at
         FROM user_discounts
        WHERE user_id = ?
        ORDER BY valid_from DESC
        LIMIT 1`,
    )
    .bind(userId)
    .first<{ status: string; pro_lapses_at: number | null; expires_at: number | null }>();

  // 3) gift_grants 最大 expires_at（不限 source —— 给用户看「总的 Pro 余额」）
  const giftRow = await db
    .prepare(
      `SELECT MAX(expires_at) AS m FROM gift_grants
        WHERE user_id = ? AND status = 'active' AND expires_at > ?`,
    )
    .bind(userId, now)
    .first<{ m: number | null }>();

  const giftMax = giftRow?.m ?? 0;
  const giftBalanceDays = giftMax > now ? Math.ceil((giftMax - now) / MS_PER_DAY) : 0;

  if (!partRow) {
    return { snapshot: null, giftBalanceDays };
  }

  const status = udRow?.status ?? 'active';
  const proLapsesAt = udRow?.pro_lapses_at ?? null;
  const expiresAt = udRow?.expires_at ?? null;
  // discountActive: user_discounts.status='active' AND 没有显式过期
  // 注意：宽限期是否到期由 checkout 路径的 resolveActiveDiscount 真正裁决；
  // /v1/me 这里只看 status 字段（lazy 自治愈的延迟接受）
  const notExpiredByExpiresAt = expiresAt == null || expiresAt > now;
  const discountActive = status === 'active' && notExpiredByExpiresAt;

  return {
    snapshot: {
      isParticipant: true,
      discountActive,
      proLapsesAt: proLapsesAt != null ? new Date(proLapsesAt).toISOString() : null,
    },
    giftBalanceDays,
  };
}
