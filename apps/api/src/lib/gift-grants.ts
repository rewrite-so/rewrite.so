/**
 * Gift grants — 通用「赠送 Pro 时长」发放入口。
 *
 * 所有赠送场景（早鸟报名、礼品卡兑换、admin 手工补偿、抽奖）都通过 grantDays()
 * 落 gift_grants 表。`resolveUserTier()` 会把 active gift 视为 pro tier 的额外
 * 来源（不影响月配额池子，pro 仍 2000/月）。
 *
 * 续期叠加语义：同 user 多张 grant 时间窗自动错开，避免「补偿 15 天但实际多 0 天」
 * 的浪费。新 grant 的 `granted_at = max(now, baseEnd ?? 0, currentMaxGiftExpiresAt)`，
 * `expires_at = granted_at + days * 86400000`。
 *
 * 幂等：`id` 由 `(userId, sourceKind, sourceId)` 哈希确定性生成；同 source 重试
 * 会被 INSERT OR IGNORE 兜住。想给同用户多次叠加（如 admin 多次补偿）→ caller
 * 必须让 `sourceId` 每次不同（建议附 timestamp）让 id 散开。
 *
 * 副作用内嵌：INSERT 成功（非重复）后自动：
 *   1) extendProLapsesAt(userId, expires_at) — 推 user_discounts.pro_lapses_at
 *   2) kv.delete(`gift_active:<userId>`) — 让 resolveUserTier 立即看到新 grant
 * 这样未来任何新增 caller（admin 补偿、礼品卡兑换、抽奖）调一行就 done，
 * 不会漏 invalidate / 漏推 pro_lapses_at。
 *
 * 例外：D1 batch 场景（如 POST /v1/campaigns/:slug/join 把 gift_grants /
 * user_discounts / campaign_participations 三表打包到原子 batch）不能用 helper
 * —— helper 是非 batch 的单 INSERT，无法与其他 INSERT 共享原子性。batch caller
 * 必须自己负责 extendProLapsesAt + KV invalidate（参考 routes/campaigns.ts）。
 */
import { log } from './log.ts';
import { GIFT_ACTIVE_CACHE_PREFIX } from './quota.ts';
import { extendProLapsesAt } from './user-discounts.ts';

export interface GrantDaysInput {
  userId: string;
  days: number;
  sourceKind: 'campaign' | 'redemption' | 'admin' | 'system';
  sourceId: string;
  /**
   * 业务规则定的「最早起算时间点」(epoch ms)。例如报名时已 Pro 的用户传入
   * `subscription.current_period_end` 让 90 天 gift 从订阅期满才起算，避免与现有
   * 订阅期重叠浪费。helper 内部还会与已有 active grant 的 max(expires_at) 再取
   * max，所以 caller 只需要传业务级别的下界。
   */
  baseEnd?: number;
  /** Admin 可读备注，落 gift_grants.note */
  note?: string;
}

export interface GrantDaysResult {
  id: string;
  granted_at: number;
  expires_at: number;
  /** true = PK 冲突已 IGNORE（同 sourceId 重试），未真正插新行 */
  isDuplicate: boolean;
}

const MS_PER_DAY = 86_400_000;

/**
 * 确定性 id：`gg_<sha256(userId + ':' + sourceKind + ':' + sourceId).slice(0, 12)>`。
 *
 * 同输入 → 同 id；不同 sourceId → 几乎肯定不同 id（碰撞概率 < 1e-14 在 1M 行规模）。
 */
export async function computeGrantId(
  userId: string,
  sourceKind: string,
  sourceId: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${sourceKind}:${sourceId}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < 6; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return `gg_${hex}`;
}

/**
 * 查询用户当前所有 active gift_grants 的最大 expires_at。
 * 没有 active grant 时返 0。
 */
export async function getCurrentMaxGiftExpiresAt(
  db: D1Database,
  userId: string,
  now: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT MAX(expires_at) AS m FROM gift_grants
        WHERE user_id = ? AND status = 'active' AND expires_at > ?`,
    )
    .bind(userId, now)
    .first<{ m: number | null }>();
  return row?.m ?? 0;
}

export interface GrantDaysOptions {
  /**
   * KV binding。INSERT 成功（非重复）后用于 invalidate `gift_active:<userId>`
   * 让 resolveUserTier 立即看到新 grant。
   *
   * **Required**：故意不设可选，让 TS 编译期强制 caller 传入。生产 worker 拿到的
   * `env.KV` 永远可用；测试要绕过传 `null` 显式标记意图，不允许"忘了传"。
   */
  kv: KVNamespace | null;
}

/**
 * 标准发放入口。返回 { id, granted_at, expires_at, isDuplicate }。
 *
 * isDuplicate=true 时表示该 source 已发放过（PK 冲突），DB 未变化，
 * 内嵌副作用（extendProLapsesAt / KV invalidate）会被跳过。
 *
 * 副作用容错：`extendProLapsesAt` 失败用 `log.warn` 静默吞，与 webhook.ts
 * 的同名调用模式一致——避免「gift_grants 已写入但 extend 抛错 → caller 异常 →
 * retry 时 INSERT OR IGNORE 命中 PK 冲突走 isDuplicate=true 分支永久跳过
 * extend」的隐式失败。CLAUDE.md「容错硬契约：任何失败都必须静默吞」要求。
 */
export async function grantDays(
  db: D1Database,
  input: GrantDaysInput,
  options: GrantDaysOptions,
): Promise<GrantDaysResult> {
  const { userId, days, sourceKind, sourceId, baseEnd, note } = input;
  const now = Date.now();
  const currentMax = await getCurrentMaxGiftExpiresAt(db, userId, now);
  const granted_at = Math.max(now, baseEnd ?? 0, currentMax);
  const expires_at = granted_at + days * MS_PER_DAY;
  const id = await computeGrantId(userId, sourceKind, sourceId);

  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO gift_grants
         (id, user_id, days, granted_at, expires_at, source_kind, source_id, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    )
    .bind(id, userId, days, granted_at, expires_at, sourceKind, sourceId, note ?? null, now, now)
    .run();

  const meta = (result as { meta?: { changes?: number } }).meta;
  const changes = typeof meta?.changes === 'number' ? meta.changes : 0;
  const isDuplicate = changes === 0;

  // 副作用：仅在真正写入新行时触发，避免重复请求重复推 pro_lapses_at / 清缓存
  if (!isDuplicate) {
    await extendProLapsesAt(db, userId, expires_at).catch((err) => {
      log.warn('gift_grants.extend_pro_lapses_at_failed', { userId, sourceKind, sourceId, err });
    });
    const kv = options.kv;
    if (kv && typeof kv.delete === 'function') {
      await kv.delete(`${GIFT_ACTIVE_CACHE_PREFIX}${userId}`).catch(() => undefined);
    }
  }

  return { id, granted_at, expires_at, isDuplicate };
}
