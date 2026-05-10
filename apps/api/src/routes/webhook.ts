import { Hono } from 'hono';
import {
  type CreemEventEnvelope,
  type CreemPlan,
  extractCustomerId,
  extractPeriodEnd,
  extractPeriodStart,
  extractProductId,
  extractUserIdFromMetadata,
  planFromProductId,
  verifyWebhookSignature,
} from '../lib/creem.ts';
import { log } from '../lib/log.ts';
import type { AppEnv } from '../types.ts';

export const webhookRoute = new Hono<AppEnv>();

/**
 * POST /webhooks/creem
 *
 * 路径在 /webhooks/creem 不在 /api/...，避免 OpenNext path 重写（详见 CLAUDE.md）。
 *
 * 流程：
 * 1) 校验 creem-signature（HMAC-SHA256 hex over raw body）— 失败返 401
 * 2) 幂等：event.id 已记录 → 直接 200 noop
 * 3) 路由到事件处理器，落库 subscriptions
 * 4) 写入 webhook_events 防重放
 *
 * 注意：必须在 verify 之前用 c.req.text() 拿原始 body，不能 c.req.json()，
 * 否则 Hono 内部把 body 流读了再 stringify 会丢空白和顺序，签名对不上。
 */
webhookRoute.post('/webhooks/creem', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('creem-signature') ?? c.req.header('x-creem-signature') ?? null;

  const ok = await verifyWebhookSignature(rawBody, signature, c.env.CREEM_WEBHOOK_SECRET);
  if (!ok) {
    log.warn('webhook.invalid_signature');
    return c.json({ error: 'invalid_signature' }, 401);
  }

  let envelope: CreemEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as CreemEventEnvelope;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (!envelope.id || !envelope.eventType) {
    return c.json({ error: 'invalid_envelope' }, 400);
  }

  // 幂等：event.id 是 webhook_events.event_id 的 PK
  const seen = await c.env.DB.prepare('SELECT event_id FROM webhook_events WHERE event_id = ?')
    .bind(envelope.id)
    .first<{ event_id: string }>();
  if (seen) {
    return c.json({ ok: true, idempotent: true });
  }

  try {
    await routeEvent(c.env, envelope);
  } catch (err) {
    log.error('webhook.handler_error', {
      eventId: envelope.id,
      eventType: envelope.eventType,
      err,
    });
    // 不写 webhook_events，让 Creem 重试
    return c.json({ error: 'handler_error' }, 500);
  }

  // 记录幂等键（payload 不含原文，仅 event metadata）
  await c.env.DB.prepare(
    `INSERT INTO webhook_events (event_id, source, received_at, payload)
     VALUES (?, 'creem', ?, ?)`,
  )
    .bind(envelope.id, Date.now(), JSON.stringify({ eventType: envelope.eventType }))
    .run();

  return c.json({ ok: true });
});

/**
 * 事件 → D1 落库参数映射。
 *
 * 关键约束：D1 status 由 eventType 决定（除 subscription.update 外），**不读
 * object.status**。原因：subscription.expired 事件的 object.status 实测仍是
 * "active"（Creem 文档样例如此），如果信 object.status 会让 expired 事件误落成
 * active。同理 paid 续费时 object.status 也是 active；status 终态以 eventType 为准。
 *
 * scheduled_cancel 单独路径：D1 status='active'（让 resolveUserTier 仍认 pro
 * 直到 expired 事件来），cancel_at_period_end=1（让 UI 显示"将于 X 月 Y 日结束"）。
 *
 * 来源：docs.creem.io/code/webhooks + docs.creem.io/llms-full.txt sample payloads
 */
async function routeEvent(env: AppEnv['Bindings'], evt: CreemEventEnvelope): Promise<void> {
  switch (evt.eventType) {
    case 'subscription.active':
    case 'subscription.paid':
    case 'subscription.resumed':
      // paid 是 Creem 推荐的开权事件（续费只发 paid 不发 active）
      await upsertSubscription(env, evt, 'active');
      return;

    case 'subscription.trialing':
      await upsertSubscription(env, evt, 'trialing');
      return;

    case 'subscription.paused':
      // paused = 暂时停止计费但保留访问权限。我们当 'paused' 落 D1，resolveUserTier
      // 仍会按 'paused' → pro 处理（继续给配额）。
      await upsertSubscription(env, evt, 'paused');
      return;

    case 'subscription.canceled':
      // 用户主动立即取消 OR 周期末已到期。落 status='canceled'；resolveUserTier
      // 会用 current_period_end > now 决定是否仍给 Pro 配额。
      await upsertSubscription(env, evt, 'canceled');
      return;

    case 'subscription.scheduled_cancel':
      // 用户点了"周期末取消"——D1 status 仍 active 让 resolveUserTier 给 Pro，
      // cancel_at_period_end=true 让 UI 显示"将结束"。期末后 Creem 会发
      // subscription.canceled / expired 真正终止。
      await upsertSubscription(env, evt, 'active', { cancelAtPeriodEnd: true });
      return;

    case 'subscription.past_due':
      // 付款失败（renewal 扣款不成功）。Creem 后续会重试，成功后发 subscription.paid。
      await upsertSubscription(env, evt, 'past_due');
      return;

    case 'subscription.expired':
      // ⚠️ 实测 expired 事件 object.status 仍是 "active"，必须按 eventType 决定 'expired'。
      await upsertSubscription(env, evt, 'expired');
      return;

    case 'subscription.update':
      // update = plan 切换 / period 推进 / 任何字段变更。语义上 status 可能变化，
      // 用 object.status 推导（scheduled_cancel 走 cancel_at_period_end 分支）。
      await upsertFromUpdate(env, evt);
      return;

    case 'transaction.failed':
      // 历史路径：标 past_due（如能找到对应 subscription）。新增的 subscription.past_due
      // 是更直接的信号，但保留这条作为补强。
      await markPastDue(env, evt);
      return;

    case 'checkout.completed':
    case 'checkout.abandoned':
    case 'transaction.completed':
      // 这些事件 informational，subscription.* 是真理。不落库 subscriptions 表。
      return;

    default:
      // 未识别事件类型不能默默吞——历史教训：subscription.paid 漏识别 + default 静默
      // 写幂等键 = Creem 不重发，付费用户掉档没人发现。
      // 现在改为 throw 让外层 catch 返 500 + 不写 webhook_events，触发 Creem 自动
      // 重试（30s/1min/5min/1h，4 次后停）+ Cloudflare Logs 出现 webhook.handler_error
      // 警报，运维有时间识别新事件类型扩展 case。
      // 来源：docs.creem.io/llms-full.txt 行 2445 / 5663（重试策略）
      log.warn('webhook.unhandled', { eventType: evt.eventType, eventId: evt.id });
      throw new Error(`unhandled webhook event type: ${evt.eventType}`);
  }
}

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired';

/**
 * subscription.update 专用：从 object.status 决定 D1 status。
 * scheduled_cancel 特殊处理（D1 active + cancelAtPeriodEnd=true）。
 * 未识别 status 兜底 'active'（保守地保留访问权，等下个明确事件）。
 */
async function upsertFromUpdate(env: AppEnv['Bindings'], evt: CreemEventEnvelope): Promise<void> {
  const obj = evt.object as Record<string, unknown> | undefined;
  if (!obj) {
    log.warn('webhook.missing_object', { eventId: evt.id });
    return;
  }
  const rawStatus = typeof obj.status === 'string' ? obj.status : 'active';
  if (rawStatus === 'scheduled_cancel') {
    await upsertSubscriptionFromObject(env, obj, 'active', evt.id, { cancelAtPeriodEnd: true });
    return;
  }
  const status: SubscriptionStatus = (() => {
    if (
      rawStatus === 'active' ||
      rawStatus === 'trialing' ||
      rawStatus === 'paused' ||
      rawStatus === 'past_due' ||
      rawStatus === 'canceled' ||
      rawStatus === 'expired'
    ) {
      return rawStatus;
    }
    return 'active'; // unknown / 'unpaid' 等保守兜底
  })();
  await upsertSubscriptionFromObject(env, obj, status, evt.id);
}

interface SubscriptionRow {
  id: string;
}

async function upsertSubscription(
  env: AppEnv['Bindings'],
  evt: CreemEventEnvelope,
  status: SubscriptionStatus,
  opts?: { cancelAtPeriodEnd?: boolean },
): Promise<void> {
  const obj = evt.object as Record<string, unknown> | undefined;
  if (!obj) {
    log.warn('webhook.missing_object', { eventId: evt.id });
    return;
  }
  await upsertSubscriptionFromObject(env, obj, status, evt.id, opts);
}

/**
 * 从一个 Creem subscription-like object 落库。被 webhook 路由（subscription.* 事件）
 * 和 /v1/billing/verify-checkout（旁路 webhook，避免延迟期间用户感知不一致）共用。
 *
 * 幂等：以 creem_subscription_id 为去重键；同 sub 多次调（webhook + verify 都跑）会
 * UPDATE 而不是重复 INSERT。
 *
 * `opts.cancelAtPeriodEnd` 由调用方按 eventType / status 显式推导
 * （Creem SubscriptionEntity 没有该字段——取消语义靠 status='scheduled_cancel' 表达），
 * 默认 false。详见 CLAUDE.md "Creem 没有 cancel_at_period_end 字段" 规则。
 *
 * 返回 true=实际落库；false=因字段缺失或产品 id 未识别等原因 skip（已记 warn 日志）。
 * verify 端点用返回值决定是否给客户端返 applied=true，避免静默 fail 但 UI 显示成功。
 */
export async function upsertSubscriptionFromObject(
  env: AppEnv['Bindings'],
  obj: Record<string, unknown>,
  status: SubscriptionStatus,
  ctxId: string, // 日志关联用（webhook eventId / verify checkoutId）
  opts?: { cancelAtPeriodEnd?: boolean },
): Promise<boolean> {
  const userId = extractUserIdFromMetadata(obj);
  const customerId = extractCustomerId(obj);
  const productId = extractProductId(obj);
  const subId = typeof obj.id === 'string' ? obj.id : null;

  if (!userId || !customerId || !productId || !subId) {
    log.warn('subscription.missing_fields', {
      ctxId,
      hasUserId: !!userId,
      hasCustomerId: !!customerId,
      hasProductId: !!productId,
      hasSubId: !!subId,
    });
    return false;
  }

  const plan: CreemPlan | null = planFromProductId(
    productId,
    env.CREEM_PRO_MONTHLY_PRODUCT_ID,
    env.CREEM_PRO_YEARLY_PRODUCT_ID,
  );
  if (!plan) {
    log.warn('subscription.unknown_product', { ctxId, productId });
    return false;
  }

  const periodStartIso = extractPeriodStart(obj);
  const periodEndIso = extractPeriodEnd(obj);
  const periodStart = periodStartIso ? Date.parse(periodStartIso) : Date.now();
  const periodEnd = periodEndIso ? Date.parse(periodEndIso) : Date.now() + 31 * 86400_000;

  const cancelAtPeriodEnd = opts?.cancelAtPeriodEnd ?? false;

  const now = Date.now();

  // 先查是否已有 row（按 creem_subscription_id），决定 INSERT 或 UPDATE
  const existing = await env.DB.prepare(
    'SELECT id FROM subscriptions WHERE creem_subscription_id = ?',
  )
    .bind(subId)
    .first<SubscriptionRow>();

  if (existing) {
    await env.DB.prepare(
      `UPDATE subscriptions
         SET status = ?, plan = ?, product_id = ?,
             creem_customer_id = ?,
             current_period_start = ?, current_period_end = ?,
             cancel_at_period_end = ?, updated_at = ?
       WHERE creem_subscription_id = ?`,
    )
      .bind(
        status,
        plan,
        productId,
        customerId,
        periodStart,
        periodEnd,
        cancelAtPeriodEnd ? 1 : 0,
        now,
        subId,
      )
      .run();
    return true;
  }

  // 新订阅：用 sub_id 当主键 id（避免再生成一份）
  await env.DB.prepare(
    `INSERT INTO subscriptions (
        id, user_id, creem_subscription_id, creem_customer_id,
        product_id, plan, status,
        current_period_start, current_period_end,
        cancel_at_period_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      subId,
      userId,
      subId,
      customerId,
      productId,
      plan,
      status,
      periodStart,
      periodEnd,
      cancelAtPeriodEnd ? 1 : 0,
      now,
      now,
    )
    .run();
  return true;
}

async function markPastDue(env: AppEnv['Bindings'], evt: CreemEventEnvelope): Promise<void> {
  const obj = evt.object as Record<string, unknown> | undefined;
  if (!obj) return;
  // transaction.failed 的 object 是 transaction，里面引用 subscription
  const subRef = obj.subscription;
  let subId: string | null = null;
  if (typeof subRef === 'string') subId = subRef;
  else if (subRef && typeof subRef === 'object') {
    const r = subRef as Record<string, unknown>;
    if (typeof r.id === 'string') subId = r.id;
  }
  if (!subId) return;

  await env.DB.prepare(
    `UPDATE subscriptions SET status = 'past_due', updated_at = ?
       WHERE creem_subscription_id = ?`,
  )
    .bind(Date.now(), subId)
    .run();
}
