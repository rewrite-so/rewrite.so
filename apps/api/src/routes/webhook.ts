import { Hono } from 'hono';
import {
  type CreemEventEnvelope,
  type CreemPlan,
  extractCustomerId,
  extractPeriodEnd,
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

async function routeEvent(env: AppEnv['Bindings'], evt: CreemEventEnvelope): Promise<void> {
  switch (evt.eventType) {
    case 'subscription.active':
    case 'subscription.trialing':
    case 'subscription.resumed':
      await upsertSubscription(env, evt, mapStatusFromEvent(evt.eventType));
      return;

    case 'subscription.paused':
      // paused = 暂时停止计费但保留访问权限。我们当 'active' 处理（继续给配额），
      // 但 status 字段记录 'paused'，便于运维识别。
      await upsertSubscription(env, evt, 'paused');
      return;

    case 'subscription.canceled':
      // 立即取消 OR 周期末取消，由 object 里的 cancelAtPeriodEnd 决定。
      // 我们在数据库存 status='canceled'；查询时若 current_period_end > now 仍认为有 Pro 配额。
      await upsertSubscription(env, evt, 'canceled');
      return;

    case 'subscription.expired':
      await upsertSubscription(env, evt, 'expired');
      return;

    case 'transaction.failed':
      // 标 past_due（如果能找到对应 subscription）。Creem 会在恢复后发 subscription.active。
      await markPastDue(env, evt);
      return;

    case 'checkout.completed':
    case 'checkout.abandoned':
    case 'transaction.completed':
      // 这些事件 informational，subscription.* 是真理。不落库 subscriptions 表。
      return;

    default:
      log.warn('webhook.unhandled', { eventType: evt.eventType });
  }
}

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired';

function mapStatusFromEvent(t: string): SubscriptionStatus {
  if (t === 'subscription.trialing') return 'trialing';
  // active / resumed → active
  return 'active';
}

interface SubscriptionRow {
  id: string;
}

async function upsertSubscription(
  env: AppEnv['Bindings'],
  evt: CreemEventEnvelope,
  status: SubscriptionStatus,
): Promise<void> {
  const obj = evt.object as Record<string, unknown> | undefined;
  if (!obj) {
    log.warn('webhook.missing_object', { eventId: evt.id });
    return;
  }

  const userId = extractUserIdFromMetadata(obj);
  const customerId = extractCustomerId(obj);
  const productId = extractProductId(obj);
  const subId = typeof obj.id === 'string' ? obj.id : null;

  if (!userId || !customerId || !productId || !subId) {
    log.warn('webhook.missing_fields', {
      eventId: evt.id,
      hasUserId: !!userId,
      hasCustomerId: !!customerId,
      hasProductId: !!productId,
      hasSubId: !!subId,
    });
    return;
  }

  const plan: CreemPlan | null = planFromProductId(
    productId,
    env.CREEM_PRO_MONTHLY_PRODUCT_ID,
    env.CREEM_PRO_YEARLY_PRODUCT_ID,
  );
  if (!plan) {
    log.warn('webhook.unknown_product', { eventId: evt.id, productId });
    return;
  }

  const periodStartIso = pickIsoDate(obj, 'currentPeriodStart', 'current_period_start');
  const periodEndIso = extractPeriodEnd(obj);
  const periodStart = periodStartIso ? Date.parse(periodStartIso) : Date.now();
  const periodEnd = periodEndIso ? Date.parse(periodEndIso) : Date.now() + 31 * 86400_000;

  const cancelAtPeriodEnd =
    typeof obj.cancelAtPeriodEnd === 'boolean'
      ? obj.cancelAtPeriodEnd
      : typeof obj.cancel_at_period_end === 'boolean'
        ? obj.cancel_at_period_end
        : false;

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
    return;
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

function pickIsoDate(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string') return v;
  }
  return null;
}
