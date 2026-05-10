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

// Creem test mode 走 test-api.creem.io；生产走 api.creem.io。
// 根据 x-api-key 前缀自动路由（creem_test_* → test，creem_* → live）。
function creemBase(apiKey: string): string {
  return apiKey.startsWith('creem_test_')
    ? 'https://test-api.creem.io/v1'
    : 'https://api.creem.io/v1';
}

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
  const res = await fetch(`${creemBase(input.apiKey)}/checkouts`, {
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

/**
 * GET /v1/checkouts/{id} —— 主动查询 checkout 状态。
 *
 * 用途：用户从 Creem 跳回 web /settings?billing=ok 后，web 立即调
 * /v1/billing/verify-checkout 让我们这边查一次 Creem，把 subscription 直接落库——
 * 不等 webhook（可能延迟数秒到数分钟）。webhook 仍会发，靠 PK 幂等。
 *
 * Creem 文档：返回的 checkout 完成后 object 里会带 subscription / customer 字段。
 */
export async function fetchCheckout(input: {
  apiKey: string;
  checkoutId: string;
}): Promise<CreemCheckoutObject> {
  // 单查 endpoint 用 query param，不是 path param。写错路径一律 404。
  // OpenAPI: https://docs.creem.io/api-reference/openapi.json operationId=retrieveCheckout
  const params = new URLSearchParams({ checkout_id: input.checkoutId });
  const url = `${creemBase(input.apiKey)}/checkouts?${params}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-api-key': input.apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Creem fetchCheckout failed: ${res.status} ${text}`);
  }
  return (await res.json()) as CreemCheckoutObject;
}

/**
 * GET /v1/subscriptions?subscription_id=xxx —— 按 id 拉单个订阅。
 *
 * verify-checkout 用：当 GET /checkouts 返回的 subscription 字段是 string id 时
 * （`CheckoutEntity.subscription` 是 oneOf [string, SubscriptionEntity]，文档明确两种都
 * 合法），必须再调一次本接口拿到完整 SubscriptionEntity 才能 upsert 到 D1。
 *
 * 来源：https://docs.creem.io/api-reference/openapi.json operationId=retrieveSubscription
 */
export async function fetchSubscription(input: {
  apiKey: string;
  subscriptionId: string;
}): Promise<CreemSubscriptionObject> {
  const params = new URLSearchParams({ subscription_id: input.subscriptionId });
  const url = `${creemBase(input.apiKey)}/subscriptions?${params}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-api-key': input.apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Creem fetchSubscription failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as CreemSubscriptionObject;
}

/**
 * GET /v1/subscriptions/search —— 列订阅，给 reconcile cron 用。
 *
 * 用途：webhook miss 兜底。如果 Creem webhook 因为网络/CF 抽风没到达，订阅状态在 D1
 * 永远不会更新。每天 cron 跑一次，列最近 N 小时内的 subs，对比 D1 缺的补上。
 *
 * Creem 实际契约（OpenAPI 验证）：
 * - endpoint 是 `/v1/subscriptions/search`（**不是** `/v1/subscriptions`，那个是单查必传 subscription_id）
 * - 仅支持 query `page_number` / `page_size`（**不支持** `created_after` filter，要客户端过滤）
 * - response shape 是 `{ items: CreemSubscriptionObject[], pagination: ... }`
 *
 * 来源：https://docs.creem.io/api-reference/openapi.json SubscriptionListEntity
 */
export async function listSubscriptions(input: {
  apiKey: string;
  pageNumber?: number;
  pageSize?: number;
}): Promise<CreemSubscriptionObject[]> {
  const params = new URLSearchParams();
  params.set('page_number', String(input.pageNumber ?? 1));
  params.set('page_size', String(input.pageSize ?? 100));
  const url = `${creemBase(input.apiKey)}/subscriptions/search?${params}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-api-key': input.apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Creem listSubscriptions failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { items?: CreemSubscriptionObject[]; pagination?: unknown };
  return body.items ?? [];
}

export async function createPortalSession(input: CreatePortalInput): Promise<CreatePortalOutput> {
  const res = await fetch(`${creemBase(input.apiKey)}/customers/billing`, {
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
  | 'subscription.paid'
  | 'subscription.trialing'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.canceled'
  | 'subscription.scheduled_cancel'
  | 'subscription.past_due'
  | 'subscription.expired'
  | 'subscription.update'
  | 'transaction.completed'
  | 'transaction.failed';

/**
 * Webhook envelope 顶层结构。
 * 命名混合：`id` / `eventType`(camelCase) / `created_at`(snake, number epoch ms) /
 * `object`。注意 envelope 顶层 `created_at` 是 number，envelope.object 内
 * `created_at` 是 ISO string——同名不同类型。
 * 来源：实测 evt_6zB7KdtiwxUvGg8tu8KUV5 + docs.creem.io/llms-full.txt sample
 */
export interface CreemEventEnvelope<T = unknown> {
  id: string;
  eventType: CreemEventType;
  created_at: number;
  object: T;
}

/**
 * SubscriptionEntity（webhook envelope.object 形态 + retrieveSubscription response）。
 * 字段命名严格 snake_case 与 OpenAPI 一致。
 *
 * 注意：
 * - period 字段带 `_date` 后缀（ISO string），不是 `current_period_*`
 * - 没有 `cancel_at_period_end` 字段——取消语义靠 `status='scheduled_cancel'`
 *   表达，落 D1 时由 webhook routeEvent 显式按 status 推导 cancelAtPeriodEnd
 *   传给 upsertSubscriptionFromObject(opts)
 * - `metadata` 在 OpenAPI schema 未声明但 webhook payload 实测出现（每个 event 都带）
 *
 * 来源：https://docs.creem.io/api-reference/openapi.json SubscriptionEntity
 */
export interface CreemSubscriptionObject {
  id: string;
  mode?: string;
  object?: 'subscription';
  status: string; // 'active'|'canceled'|'unpaid'|'paused'|'trialing'|'scheduled_cancel'|'past_due'(payload only)|'expired'(payload only)
  customer: string | { id: string; email?: string };
  product: string | { id: string };
  items?: unknown[];
  collection_method?: string;
  last_transaction_id?: string;
  last_transaction?: CreemTransactionObject;
  last_transaction_date?: string;
  next_transaction_date?: string;
  current_period_start_date?: string;
  current_period_end_date?: string;
  canceled_at?: string | null;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, string>;
}

/**
 * TransactionEntity. 注意字段类型与 SubscriptionEntity 不同：
 * `period_start / period_end / created_at` 都是 epoch ms number，**不是 ISO string**；
 * `subscription / customer` 都是 string id 或 null（不像 SubscriptionEntity 是 oneOf）。
 * OpenAPI 没声明 metadata 字段。
 * 来源：https://docs.creem.io/api-reference/openapi.json TransactionEntity
 */
export interface CreemTransactionObject {
  id: string;
  object?: 'transaction';
  amount: number;
  amount_paid?: number | null;
  currency: string;
  type?: string;
  status: string;
  subscription?: string | null;
  customer?: string | null;
  description?: string;
  period_start?: number;
  period_end?: number;
  created_at?: number;
  mode?: string;
}

export interface CreemCheckoutObject {
  id: string;
  customer?: string | { id: string; email?: string };
  subscription?: string | CreemSubscriptionObject;
  status: string; // 'pending' | 'processing' | 'completed' | 'expired'
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

/**
 * 从 SubscriptionEntity 捞 `current_period_end_date`（ISO string）。
 * Creem 实际字段名带 `_date` 后缀；旧的 `current_period_end / currentPeriodEnd`
 * 实测 payload 中**永远不会出现**——OpenAPI 全文 snake_case 也没声明。
 * 不再保留旧字段名兜底分支（死代码）。
 */
export function extractPeriodEnd(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.current_period_end_date === 'string') return o.current_period_end_date;
  return null;
}

/**
 * 与 extractPeriodEnd 对称——读 `current_period_start_date`。
 */
export function extractPeriodStart(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.current_period_start_date === 'string') return o.current_period_start_date;
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
