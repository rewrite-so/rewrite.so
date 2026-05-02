/**
 * Creem 计费客户端。
 *
 * 文档参考：
 * - Checkout:  POST https://api.creem.io/v1/checkouts          → returns { checkout_url }
 * - Portal:    POST https://api.creem.io/v1/customers/billing  → returns { customer_portal_link }
 * - Webhook:   header `creem-signature` 是 raw body 用 webhook secret 算的 HMAC-SHA256（hex）。
 *   事件信封：{ id, eventType, createdAt, object: {...} }
 *   订阅相关 eventType: subscription.active / .trialing / .paused / .resumed / .canceled / .expired
 *   支付相关：transaction.completed / .failed
 *   checkout：checkout.completed / .abandoned
 */

const CREEM_API = 'https://api.creem.io/v1';

export type CreemPlan = 'monthly' | 'yearly';

export interface CreateCheckoutInput {
  apiKey: string;
  productId: string;
  successUrl: string;
  /** request_id 是我们的幂等 / 关联 ID，建议传 user.id */
  requestId: string;
  /** 客户 email；checkout 完成后 Creem 会自动 upsert customer */
  customerEmail: string;
  /** metadata 会 echo 回 webhook，方便我们关联到内部 user */
  metadata?: Record<string, string>;
}

export interface CreateCheckoutOutput {
  id: string;
  checkout_url: string;
  status: string;
  request_id?: string;
}

export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutOutput> {
  const res = await fetch(`${CREEM_API}/checkouts`, {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      product_id: input.productId,
      request_id: input.requestId,
      success_url: input.successUrl,
      customer: { email: input.customerEmail },
      metadata: input.metadata ?? {},
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Creem checkout failed: ${res.status} ${text}`);
  }
  return (await res.json()) as CreateCheckoutOutput;
}

export interface CreatePortalInput {
  apiKey: string;
  customerId: string;
}

export interface CreatePortalOutput {
  customer_portal_link: string;
}

export async function createPortalSession(input: CreatePortalInput): Promise<CreatePortalOutput> {
  const res = await fetch(`${CREEM_API}/customers/billing`, {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ customer_id: input.customerId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Creem portal failed: ${res.status} ${text}`);
  }
  return (await res.json()) as CreatePortalOutput;
}

/**
 * 校验 webhook 签名。
 * - signatureHeader 是 request.headers.get('creem-signature')
 * - rawBody 必须是 request.text() 拿到的原始字符串（不能 JSON.parse 后再 stringify，会丢空白）
 * - 返回 true=合法，false=拒绝
 *
 * 用 timing-safe equal 防侧信道。
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const expected = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(expected, signatureHeader.trim());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ===== Webhook 事件类型 =====

export type CreemEventType =
  | 'checkout.completed'
  | 'checkout.abandoned'
  | 'subscription.active'
  | 'subscription.trialing'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.canceled'
  | 'subscription.expired'
  | 'transaction.completed'
  | 'transaction.failed';

export interface CreemEventEnvelope<T = unknown> {
  id: string;
  eventType: CreemEventType;
  createdAt: string;
  object: T;
}

export interface CreemSubscriptionObject {
  id: string;
  customerId?: string;
  customer?: string | { id: string; email?: string };
  productId?: string;
  product?: string | { id: string };
  status: string; // 'active' | 'trialing' | 'paused' | 'canceled' | 'expired' | ...
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, string>;
}

export interface CreemCheckoutObject {
  id: string;
  customer?: string | { id: string; email?: string };
  customerId?: string;
  subscription?: string | CreemSubscriptionObject;
  status: string;
  metadata?: Record<string, string>;
  request_id?: string;
}

/**
 * 从 envelope.object 里捞 customerId（不同事件类型字段名可能不一致）。
 */
export function extractCustomerId(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.customerId === 'string') return o.customerId;
  if (typeof o.customer_id === 'string') return o.customer_id;
  const cust = o.customer;
  if (typeof cust === 'string') return cust;
  if (cust && typeof cust === 'object') {
    const c = cust as Record<string, unknown>;
    if (typeof c.id === 'string') return c.id;
  }
  return null;
}

/**
 * 从 envelope.object.metadata 里捞我们传的内部 user_id。
 */
export function extractUserIdFromMetadata(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const md = o.metadata;
  if (md && typeof md === 'object') {
    const m = md as Record<string, unknown>;
    if (typeof m.user_id === 'string') return m.user_id;
    if (typeof m.userId === 'string') return m.userId;
  }
  // fallback: request_id 我们也填了 user.id
  if (typeof o.request_id === 'string') return o.request_id;
  if (typeof o.requestId === 'string') return o.requestId;
  return null;
}

/**
 * 从订阅 object 里捞 productId，以决定 plan = monthly | yearly。
 */
export function extractProductId(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.productId === 'string') return o.productId;
  if (typeof o.product_id === 'string') return o.product_id;
  const prod = o.product;
  if (typeof prod === 'string') return prod;
  if (prod && typeof prod === 'object') {
    const p = prod as Record<string, unknown>;
    if (typeof p.id === 'string') return p.id;
  }
  return null;
}

export function extractPeriodEnd(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.currentPeriodEnd === 'string') return o.currentPeriodEnd;
  if (typeof o.current_period_end === 'string') return o.current_period_end;
  return null;
}

export function planFromProductId(
  productId: string | null,
  monthlyId: string,
  yearlyId: string,
): CreemPlan | null {
  if (productId === monthlyId) return 'monthly';
  if (productId === yearlyId) return 'yearly';
  return null;
}
