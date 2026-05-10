import { Hono } from 'hono';
import { z } from 'zod';
import {
  createCheckoutSession,
  createPortalSession,
  extractUserIdFromMetadata,
  fetchCheckout,
  fetchSubscription,
} from '../lib/creem.ts';
import { log } from '../lib/log.ts';
import { getOrResolveSessionUser } from '../lib/session-cache.ts';
import type { AppEnv } from '../types.ts';
import { upsertSubscriptionFromObject } from './webhook.ts';

export const billingRoute = new Hono<AppEnv>();

const CheckoutBodySchema = z
  .object({
    plan: z.enum(['monthly', 'yearly']),
    /** checkout 完成后用户重定向回的 URL（前端传，便于回到 settings/billing 页） */
    successUrl: z.string().url().optional(),
  })
  .strict();

interface SubscriptionRow {
  creem_customer_id: string;
}

/**
 * POST /v1/billing/checkout
 *
 * 登录后用户用 plan='monthly'|'yearly' 发起 Creem 结账。
 * Creem checkout 完成后会跳到 successUrl（默认 web origin /settings?billing=ok）。
 * 我们不在这里写 subscriptions 表 — 等 webhook 的 subscription.active 来落库。
 */
billingRoute.post('/v1/billing/checkout', async (c) => {
  const sessionUser = await getOrResolveSessionUser(c);
  if (!sessionUser) return c.json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const parsed = CheckoutBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: parsed.error.issues[0]?.message }, 400);
  }
  const { plan, successUrl } = parsed.data;

  const productId =
    plan === 'monthly' ? c.env.CREEM_PRO_MONTHLY_PRODUCT_ID : c.env.CREEM_PRO_YEARLY_PRODUCT_ID;
  if (!productId) {
    return c.json({ error: 'billing_unconfigured' }, 500);
  }

  const defaultSuccess = `${c.env.WEB_ORIGIN}/settings?billing=ok`;
  try {
    const checkout = await createCheckoutSession({
      apiKey: c.env.CREEM_API_KEY,
      productId,
      requestId: sessionUser.id,
      successUrl: successUrl ?? defaultSuccess,
      customerEmail: sessionUser.email,
      metadata: {
        user_id: sessionUser.id,
        plan,
      },
    });
    return c.json({ url: checkout.checkout_url });
  } catch (err) {
    log.error('billing.checkout_error', { err });
    return c.json({ error: 'creem_error' }, 502);
  }
});

/**
 * POST /v1/billing/verify-checkout
 *
 * Web 端从 Creem 跳回 /settings?billing=ok&checkout_id=xxx 后立即调一次：
 * - 如果 checkout 已完成且 metadata.user_id 与登录 session 匹配，把订阅直接落库
 * - 不等 webhook（可能延迟几秒到几分钟），但 webhook 仍会发，靠 creem_subscription_id PK 幂等
 *
 * 不验证签名（因为是用户带着 session 主动调；恶意用户最多触发"自己订阅落库"——
 * Creem 不会让别人付钱给你）。但严格校验 checkout.metadata.user_id == sessionUser.id
 * 防止伪造 checkout_id 把别人的订阅落到自己名下。
 */
const VerifyCheckoutSchema = z
  .object({
    checkoutId: z.string().min(1).max(200),
  })
  .strict();

billingRoute.post('/v1/billing/verify-checkout', async (c) => {
  const sessionUser = await getOrResolveSessionUser(c);
  if (!sessionUser) return c.json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const parsed = VerifyCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: parsed.error.issues[0]?.message }, 400);
  }

  let checkout: Awaited<ReturnType<typeof fetchCheckout>>;
  try {
    checkout = await fetchCheckout({
      apiKey: c.env.CREEM_API_KEY,
      checkoutId: parsed.data.checkoutId,
    });
  } catch (err) {
    log.error('billing.verify_fetch_error', { err });
    return c.json({ error: 'creem_error' }, 502);
  }

  // 严格校验 metadata.user_id 防伪造
  const checkoutUserId = extractUserIdFromMetadata(checkout);
  if (checkoutUserId !== sessionUser.id) {
    log.warn('billing.verify_user_mismatch', {
      checkoutId: parsed.data.checkoutId,
      sessionUserId: sessionUser.id,
      checkoutUserId,
    });
    return c.json({ error: 'user_mismatch' }, 403);
  }

  // checkout 未完成（用户取消 / 还在支付中）
  if (checkout.status !== 'completed') {
    return c.json({ status: checkout.status, applied: false });
  }

  // CheckoutEntity.subscription 是 oneOf [string, SubscriptionEntity]，两种都合法。
  // 必须双分支处理——string 形态走 fetchSubscription 拉完整 object 再落库；
  // null/undefined 让 webhook 兜底。
  // 来源：https://docs.creem.io/api-reference/openapi.json CheckoutEntity.subscription
  const sub = checkout.subscription;
  let subObject: Record<string, unknown> | null = null;
  if (typeof sub === 'string') {
    try {
      subObject = (await fetchSubscription({
        apiKey: c.env.CREEM_API_KEY,
        subscriptionId: sub,
      })) as unknown as Record<string, unknown>;
    } catch (err) {
      log.error('billing.verify_fetch_subscription_error', {
        err,
        checkoutId: parsed.data.checkoutId,
        subscriptionId: sub,
      });
      // 显式 502 而非静默 applied:false——webhook 路径已被多次失败教训证明不可
      // 完全依赖；让用户看到失败比假成功好（前端可让用户刷新重试）。
      return c.json({ error: 'creem_error' }, 502);
    }
  } else if (sub && typeof sub === 'object') {
    subObject = sub as unknown as Record<string, unknown>;
  }

  if (!subObject) {
    // sub 缺失（极少；让 webhook 兜底）
    return c.json({ status: checkout.status, applied: false });
  }

  // active 状态落库（trialing / paused 等会由后续 webhook 修正；新购通常是 active）。
  // cancelAtPeriodEnd=false：新购 checkout 不会带 scheduled_cancel 状态。
  // 返回值告诉我们 sub 字段是否齐全到能落库——不齐全时不要骗客户端 applied=true，
  // 让 webhook 兜底
  const wrote = await upsertSubscriptionFromObject(
    c.env,
    subObject,
    'active',
    `verify-${parsed.data.checkoutId}`,
  );

  return c.json({ status: 'completed', applied: wrote });
});

/**
 * GET /v1/billing/portal
 *
 * 已订阅用户跳到 Creem 自助门户管理订阅 / 发票 / 支付方式。
 * 没订阅过的用户走这条路会 404 — 前端应只对有 subscription 的用户展示 "Manage" 按钮。
 */
billingRoute.get('/v1/billing/portal', async (c) => {
  const sessionUser = await getOrResolveSessionUser(c);
  if (!sessionUser) return c.json({ error: 'unauthorized' }, 401);

  const row = await c.env.DB.prepare(
    'SELECT creem_customer_id FROM subscriptions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
  )
    .bind(sessionUser.id)
    .first<SubscriptionRow>();

  if (!row?.creem_customer_id) {
    return c.json({ error: 'no_subscription' }, 404);
  }

  try {
    const portal = await createPortalSession({
      apiKey: c.env.CREEM_API_KEY,
      customerId: row.creem_customer_id,
    });
    return c.json({ url: portal.customer_portal_link });
  } catch (err) {
    log.error('billing.portal_error', { err });
    return c.json({ error: 'creem_error' }, 502);
  }
});
