/**
 * User discounts — checkout 时自动注入的折扣码。
 *
 * Creem 不支持 customer-bound 折扣（API 层面没有「这个折扣只对 user X 有效」的
 * 概念），所以我们在 app 层维护 `user_discounts` 表，checkout 路由读这张表拿到
 * 用户当前可用折扣码再透传到 Creem `createCheckoutSession`。
 *
 * 「Pro 资格在线时生效，60 天宽限期可恢复，超期永久失效」用 pro_lapses_at
 * 状态机表达（单调递增字段）：
 *
 *   字段语义：「按当前已知信息，Pro 资格预计在这个时间点彻底丢失（已含宽限期）」
 *
 *   更新点（都用 max(原值, 新值) 单调推进；grace 从行内 grace_period_days 列读，
 *   caller 只传 newEndTimestamp 三参数即可）：
 *     1) gift_grants 写入时：调 extendProLapsesAt(db, userId, gift.expires_at)
 *        — 例外：campaigns.ts 报名路径把 INSERT 打包进 D1 batch，pro_lapses_at 在
 *          INSERT 里就直接赋初值（NULL → MAX(0, x) = x 语义等价于 helper）。
 *     2) webhook subscription.active/trialing：调 extendProLapsesAt(db, userId, sub.current_period_end)
 *     3) webhook subscription.canceled/expired：**不调用**（current_period_end 已在 #2 记录）
 *
 *   读取（lazy-on-read，无 cron）：resolveActiveDiscount() 内部检测到
 *   `now > pro_lapses_at` 时写 `status='expired'` 并返 null。
 *
 * 重要：extendProLapsesAt 是单 UPDATE，user_discounts row 不存在时无副作用
 * （不创建 row）。webhook 对非早鸟 user 调此函数也安全。
 */

const MS_PER_DAY = 86_400_000;

export interface ActiveDiscount {
  code: string;
  percentage: number;
  duration: 'forever' | 'once' | 'repeating';
}

/**
 * checkout 时查 user 当前应注入的折扣码。返 null 表示无可用折扣。
 *
 * 内部 lazy-on-read 自治愈：若发现 active 行已过宽限期，写 status='expired' 并返 null。
 *
 * Phase 1 假设每个 user 最多一行 active discount（早鸟唯一来源），ORDER BY
 * valid_from DESC LIMIT 1 取最新。多 discount 共存时 priority 选择见 Phase 2。
 */
export async function resolveActiveDiscount(
  db: D1Database,
  userId: string,
): Promise<ActiveDiscount | null> {
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT code, percentage, duration, pro_lapses_at, expires_at
         FROM user_discounts
        WHERE user_id = ? AND status = 'active'
        ORDER BY valid_from DESC
        LIMIT 1`,
    )
    .bind(userId)
    .first<{
      code: string;
      percentage: number;
      duration: string;
      pro_lapses_at: number | null;
      expires_at: number | null;
    }>();
  if (!row) return null;

  // 主动过期（duration='once'/'repeating' + 超过 expires_at）
  if (row.expires_at != null && row.expires_at < now) {
    await markExpired(db, userId, now);
    return null;
  }
  // 宽限期超期失效
  if (row.pro_lapses_at != null && row.pro_lapses_at < now) {
    await markExpired(db, userId, now);
    return null;
  }
  return {
    code: row.code,
    percentage: row.percentage,
    duration: row.duration as ActiveDiscount['duration'],
  };
}

async function markExpired(db: D1Database, userId: string, now: number): Promise<void> {
  await db
    .prepare(
      `UPDATE user_discounts SET status='expired', updated_at=? WHERE user_id=? AND status='active'`,
    )
    .bind(now, userId)
    .run();
}

/**
 * 任何「赋予 Pro 资格」事件调用：把 user 的 pro_lapses_at 单调推到
 * `max(原值, newEndTimestamp + grace_period_days * MS_PER_DAY)`。
 *
 * - newEndTimestamp 是「这次赋予的 Pro 资格的到期时间」（epoch ms）
 * - grace_period_days 从 user_discounts 行本身读取（写入时从
 *   campaigns.config_json.perks.discount.grace_period_days 拷贝过来）；
 *   caller 不需要知道每用户的具体宽限值
 *
 * **单 UPDATE，row 不存在时无副作用**：webhook 对非早鸟 user 调此函数不会
 * 创建 row、不会报错。pro_lapses_at NULL 时 COALESCE 处理为 0；UPDATE 0 行
 * 时静默 no-op。
 */
export async function extendProLapsesAt(
  db: D1Database,
  userId: string,
  newEndTimestamp: number,
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE user_discounts
          SET pro_lapses_at = MAX(COALESCE(pro_lapses_at, 0), ? + grace_period_days * ?),
              updated_at    = ?
        WHERE user_id = ? AND status = 'active'`,
    )
    .bind(newEndTimestamp, MS_PER_DAY, now, userId)
    .run();
}
