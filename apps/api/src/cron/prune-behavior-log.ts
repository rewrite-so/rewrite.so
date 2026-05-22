import { log } from '../lib/log.ts';
import type { Bindings } from '../types.ts';

/**
 * 保留期 prune cron —— 删除 behavior_events / rewrite_request_log 中超过
 * RETENTION_DAYS 的旧行。搭车 wrangler.toml 既有的 `0 9 * * *` 触发器
 * （见 index.ts scheduled handler），无需独立 cron。
 *
 * 保留 90 天：与 AE 现有保留窗口一致；逐实体排障/漏斗 90 天足够，长期 cohort
 * 由 admin 仓预聚合表承载。改 RETENTION_DAYS 直接影响存储成本（见方案成本评估）。
 *
 * 时间列：
 * - behavior_events 用服务端 `created_at`（客户端 `ts` 不可信，时钟歪斜可致
 *   未来日期行永不过期）。
 * - rewrite_request_log 的 `ts` 本身就是 metric 服务端 emit 时间，直接用。
 *
 * 失败不抛：夜里无人值守，CF 会重试；DELETE 幂等，重跑安全。
 */

export const RETENTION_DAYS = 90;

const DAY_MS = 86_400_000;

export async function pruneBehaviorLog(
  env: Bindings,
): Promise<{ behaviorEvents: number; rewriteRequestLog: number }> {
  const t0 = Date.now();
  const cutoffMs = t0 - RETENTION_DAYS * DAY_MS;

  const beResult = await env.DB.prepare('DELETE FROM behavior_events WHERE created_at < ?')
    .bind(cutoffMs)
    .run();
  const rrlResult = await env.DB.prepare('DELETE FROM rewrite_request_log WHERE ts < ?')
    .bind(cutoffMs)
    .run();

  const behaviorEvents = beResult.meta?.changes ?? 0;
  const rewriteRequestLog = rrlResult.meta?.changes ?? 0;

  log.info('cron.prune_behavior_log.done', {
    behaviorEvents,
    rewriteRequestLog,
    cutoffMs,
    durationMs: Date.now() - t0,
  });
  return { behaviorEvents, rewriteRequestLog };
}
