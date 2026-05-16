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
 * 副作用解耦：本 helper 不调 `extendProLapsesAt()` 也不 invalidate KV —— caller
 * 负责调度这些副作用。这样在 batch 场景（如 POST /v1/campaigns/:slug/join）下
 * 可以把多个写操作打包到 D1 batch，由 caller 统一在 batch 成功后 invalidate KV，
 * 避免「helper 已 invalidate 但 batch 后续失败」的不一致。
 */

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

/**
 * 标准发放入口。返回 { id, granted_at, expires_at, isDuplicate }。
 *
 * isDuplicate=true 时表示该 source 已发放过（PK 冲突），DB 未变化；caller 不应
 * 再触发 pro_lapses_at 更新或 KV invalidate（无 D1 状态变化）。
 */
export async function grantDays(db: D1Database, input: GrantDaysInput): Promise<GrantDaysResult> {
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
  return { id, granted_at, expires_at, isDuplicate: changes === 0 };
}
