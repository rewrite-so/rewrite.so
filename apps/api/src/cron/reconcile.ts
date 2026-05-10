import { listSubscriptions } from '../lib/creem.ts';
import { log } from '../lib/log.ts';
import { upsertSubscriptionFromObject } from '../routes/webhook.ts';
import type { Bindings } from '../types.ts';

/**
 * 兜底 webhook 投递的 reconcile cron。
 *
 * 触发流程：
 * 1. 用户 Creem checkout 完成 → 跳回 /settings?billing=ok&checkout_id=xxx
 * 2. 正常路径：SettingsClient 调 /v1/billing/verify-checkout 立即落库
 * 3. 异常路径：用户跳回时关浏览器/网络中断 → verify 没跑；同时 webhook 也丢
 *    （Creem 网络问题 / CF Worker 异常）→ 订阅状态永远不到 D1
 *
 * 兜底：每天扫最近 LOOKBACK_HOURS 小时内的 active subscriptions，对比 D1。缺的补落库。
 *
 * 幂等：upsertSubscriptionFromObject 以 creem_subscription_id 为去重键。该 cron 跑多次
 * 不会产生重复行。
 */

// 看回 48 小时给 Creem webhook + verify endpoint 足够多机会先成功。如果 48 小时
// 之后 D1 仍缺一行，几乎肯定是 webhook 投递永久失败（极少见）—— reconcile 兜上。
const LOOKBACK_HOURS = 48;

export async function reconcileSubscriptions(env: Bindings): Promise<{
  scanned: number;
  reconciled: number;
  failed: number;
}> {
  const t0 = Date.now();
  const cutoffMs = Date.now() - LOOKBACK_HOURS * 3600_000;

  let scanned = 0;
  let reconciled = 0;
  let failed = 0;

  let allSubs: Awaited<ReturnType<typeof listSubscriptions>>;
  try {
    // Creem /v1/subscriptions/search 不支持 created_after filter，客户端过滤。
    // page_size=100 应足够覆盖 48h 内单产品的新订阅；超出再加分页循环。
    allSubs = await listSubscriptions({
      apiKey: env.CREEM_API_KEY,
      pageSize: 100,
    });
  } catch (err) {
    log.warn('cron.reconcile.list_failed', { err, cutoffMs });
    return { scanned: 0, reconciled: 0, failed: 1 };
  }

  // 客户端按 created_at 过滤近 LOOKBACK_HOURS 小时——SubscriptionEntity.created_at 是 ISO string。
  const subs = allSubs.filter((s) => {
    const ts = s.created_at ? Date.parse(s.created_at) : 0;
    return ts > cutoffMs;
  });

  for (const sub of subs) {
    const subId = typeof sub.id === 'string' ? sub.id : null;
    if (!subId) continue;
    scanned++;

    // 已存在则跳过（webhook / verify 已处理过）
    const existing = await env.DB.prepare(
      'SELECT id FROM subscriptions WHERE creem_subscription_id = ?',
    )
      .bind(subId)
      .first<{ id: string }>();
    if (existing) continue;

    // 缺：补落库。status 用 sub.status 字符串映射（保守值未知 → 'active'，给用户访问权，
    // 后续 webhook 真理事件会用同 PK update 修正）。
    try {
      const wrote = await upsertSubscriptionFromObject(
        env,
        sub as unknown as Record<string, unknown>,
        mapCreemStatusToDbStatus(sub.status),
        `reconcile-${subId}`,
      );
      if (wrote) reconciled++;
      else failed++;
    } catch (err) {
      failed++;
      log.warn('cron.reconcile.upsert_failed', { subId, err });
    }
  }

  log.info('cron.reconcile.done', {
    scanned,
    reconciled,
    failed,
    durationMs: Date.now() - t0,
  });
  return { scanned, reconciled, failed };
}

/**
 * Creem 状态字符串 → D1 subscriptions.status 取值（与 webhook routeEvent 一致）。
 * Creem 返 'active' / 'trialing' / 'paused' / 'canceled' / 'expired' / 'past_due' 等。
 */
function mapCreemStatusToDbStatus(
  s: string,
): 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired' {
  if (s === 'trialing') return 'trialing';
  if (s === 'paused') return 'paused';
  if (s === 'canceled') return 'canceled';
  if (s === 'expired') return 'expired';
  if (s === 'past_due') return 'past_due';
  // unknown / active / 其它都按 active 处理（保守地给用户访问权，webhook 来时修正）
  return 'active';
}
