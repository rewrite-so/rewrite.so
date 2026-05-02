import { Hono } from 'hono';
import { z } from 'zod';
import { createAuth } from '../lib/auth.ts';
import { createCheckoutSession, createPortalSession } from '../lib/creem.ts';
import type { AppEnv } from '../types.ts';

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
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

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
      requestId: session.user.id,
      successUrl: successUrl ?? defaultSuccess,
      customerEmail: session.user.email,
      metadata: {
        user_id: session.user.id,
        plan,
      },
    });
    return c.json({ url: checkout.checkout_url });
  } catch (err) {
    console.error('[billing.checkout] creem error', err);
    return c.json({ error: 'creem_error' }, 502);
  }
});

/**
 * GET /v1/billing/portal
 *
 * 已订阅用户跳到 Creem 自助门户管理订阅 / 发票 / 支付方式。
 * 没订阅过的用户走这条路会 404 — 前端应只对有 subscription 的用户展示 "Manage" 按钮。
 */
billingRoute.get('/v1/billing/portal', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  const row = await c.env.DB.prepare(
    'SELECT creem_customer_id FROM subscriptions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
  )
    .bind(session.user.id)
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
    console.error('[billing.portal] creem error', err);
    return c.json({ error: 'creem_error' }, 502);
  }
});
