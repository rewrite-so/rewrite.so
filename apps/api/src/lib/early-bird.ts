/**
 * Early-bird snapshot — 拼 /v1/me 需要的 earlyBird 字段 + giftBalanceDays。
 *
 * 输出形状对齐 packages/shared/src/me.ts:EarlyBirdSnapshotSchema。
 *
 * 性能：4 个 D1 read 通过 `db.batch([...])` 打包成**一次 RPC**（D1 在服务端
 * 仍**顺序执行**这些 statement，不并发——参考 Cloudflare D1 文档）。比 4 次
 * sequential await first() 显著降低 /v1/me 总 latency（消除 3 次 worker↔D1
 * round-trip：每次 ~5ms × 4 → 一次 ~5–10ms 往返）。不要假设 batch 内 statement
 * 之间有 isolation/隔离语义，它就是顺序执行。
 *
 * 语义分层（不要互相推导）：
 *   - `giftBalanceDays` = MAX(expires_at) 聚合 — "用户名下 Pro 余额总剩余天数"
 *     （含已激活 + 多 source 堆叠）。extension 浮窗 quota chip 在用，向后兼容
 *   - `pendingGift` = 「下一个待激活」单行（granted_at > now ASC LIMIT 1）。仅
 *     用于 UI 展示「sub 期满后还有 90 天免费 Pro」类提示。null 表示没有待激活
 *     grant（要么 gift 已激活，要么没 gift）
 *
 * 注意：宽限期是否到期由 checkout 路径的 resolveActiveDiscount 真正裁决；
 * /v1/me 这里只看 status 字段（lazy 自治愈的延迟接受）。
 */
import type { EarlyBirdSnapshot } from '@rewrite/shared';

const MS_PER_DAY = 86_400_000;

export interface EarlyBirdQueryResult {
  snapshot: EarlyBirdSnapshot | null;
  /** 当前生效 gift_grants 距 MAX(expires_at) 的剩余天数（向上取整，无生效则 0） */
  giftBalanceDays: number;
}

/**
 * 查 user 的早鸟参与与 gift_grants 状态。
 *
 * - 未参与早鸟 → snapshot=null（但仍可能有非早鸟来源的 gift_grants，
 *   giftBalanceDays 仍返聚合值）
 * - 参与早鸟 + user_discounts.status='active' + 未过期 → discountActive=true
 * - 参与早鸟 + user_discounts.status='active' 但 lazy 检测到过期 → 仍返
 *   discountActive=true（不在 read path 做副作用写入，由 resolveActiveDiscount
 *   在 checkout 时 lazy-on-read 自治愈）。这是有意为之：避免读热路径写 D1。
 */
export async function resolveEarlyBirdSnapshot(
  db: D1Database,
  userId: string,
): Promise<EarlyBirdQueryResult> {
  const now = Date.now();

  // 4 个 query 打包到一次 RPC（D1 服务端仍按顺序执行，单纯省 round-trip）。
  // D1 contract: batch 返回数组长度 === 输入 stmts 长度，解构 4-tuple 安全。
  const batchResults = await db.batch<unknown>([
    // 1) 早鸟参与状态 — 任一 type='early_bird' 的 campaign 都算
    db
      .prepare(
        `SELECT cp.joined_at AS joined_at
           FROM campaign_participations cp
           JOIN campaigns c ON c.id = cp.campaign_id
          WHERE cp.user_id = ? AND c.type = 'early_bird'
          ORDER BY cp.joined_at ASC
          LIMIT 1`,
      )
      .bind(userId),
    // 2) user_discounts 当前 row（任一 source；Phase 1 唯一来源是 campaign）
    db
      .prepare(
        `SELECT status, pro_lapses_at, expires_at
           FROM user_discounts
          WHERE user_id = ?
          ORDER BY valid_from DESC
          LIMIT 1`,
      )
      .bind(userId),
    // 3) gift_grants 最大 expires_at —— 不限 source，给用户看「总余额」
    db
      .prepare(
        `SELECT MAX(expires_at) AS m FROM gift_grants
          WHERE user_id = ? AND status = 'active' AND expires_at > ?`,
      )
      .bind(userId, now),
    // 4) 下一个「待激活」gift（granted_at 还在未来），UI 用此显示「sub 期满后启动 90 天」
    db
      .prepare(
        `SELECT granted_at, expires_at, days
           FROM gift_grants
          WHERE user_id = ? AND status = 'active' AND granted_at > ?
          ORDER BY granted_at ASC
          LIMIT 1`,
      )
      .bind(userId, now),
  ]);
  const [partRow, udRow, giftMaxRow, pendingGiftRow] = batchResults as [
    D1Result<unknown>,
    D1Result<unknown>,
    D1Result<unknown>,
    D1Result<unknown>,
  ];

  const part = partRow.results[0] as { joined_at: number } | undefined;
  const ud = udRow.results[0] as
    | { status: string; pro_lapses_at: number | null; expires_at: number | null }
    | undefined;
  const giftMax = ((giftMaxRow.results[0] as { m: number | null } | undefined)?.m ?? null) as
    | number
    | null;
  const pending = pendingGiftRow.results[0] as
    | { granted_at: number; expires_at: number; days: number }
    | undefined;

  const giftBalanceDays =
    giftMax != null && giftMax > now ? Math.ceil((giftMax - now) / MS_PER_DAY) : 0;

  if (!part) {
    return { snapshot: null, giftBalanceDays };
  }

  const status = ud?.status ?? 'active';
  const proLapsesAt = ud?.pro_lapses_at ?? null;
  const expiresAt = ud?.expires_at ?? null;
  // discountActive: user_discounts.status='active' AND 没有显式过期
  const notExpiredByExpiresAt = expiresAt == null || expiresAt > now;
  const discountActive = status === 'active' && notExpiredByExpiresAt;

  return {
    snapshot: {
      isParticipant: true,
      discountActive,
      proLapsesAt: proLapsesAt != null ? new Date(proLapsesAt).toISOString() : null,
      pendingGift: pending
        ? {
            days: pending.days,
            activatesAt: new Date(pending.granted_at).toISOString(),
            expiresAt: new Date(pending.expires_at).toISOString(),
          }
        : null,
    },
    giftBalanceDays,
  };
}
