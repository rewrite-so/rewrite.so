import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCheckoutSession,
  extractCustomerId,
  extractPeriodEnd,
  extractPeriodStart,
  extractProductId,
  extractUserIdFromMetadata,
  planFromProductId,
  verifyWebhookSignature,
} from './creem.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_test_secret';
  const body = '{"id":"evt_123","eventType":"subscription.active"}';
  // hex HMAC-SHA256(secret, body)
  // computed below from same primitives so the test is self-consistent
  async function sign(body: string, secret: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  it('accepts valid signature', async () => {
    const sig = await sign(body, secret);
    expect(await verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('rejects tampered body', async () => {
    const sig = await sign(body, secret);
    expect(await verifyWebhookSignature(`${body}x`, sig, secret)).toBe(false);
  });

  it('rejects wrong secret', async () => {
    const sig = await sign(body, secret);
    expect(await verifyWebhookSignature(body, sig, `${secret}x`)).toBe(false);
  });

  it('rejects missing header', async () => {
    expect(await verifyWebhookSignature(body, null, secret)).toBe(false);
  });

  it('rejects empty header', async () => {
    expect(await verifyWebhookSignature(body, '', secret)).toBe(false);
  });

  it('trims whitespace around header', async () => {
    const sig = await sign(body, secret);
    expect(await verifyWebhookSignature(body, `  ${sig}\n`, secret)).toBe(true);
  });
});

describe('extractCustomerId', () => {
  // SubscriptionEntity.customer / CheckoutEntity.customer 是 oneOf [string, CustomerEntity]——
  // 旧顶层 customerId / customer_id 字段 OpenAPI 不声明且实测 payload 不出现，
  // 不再保留 fallback（与 extractPeriodEnd 对齐）。
  it('reads string customer field', () => {
    expect(extractCustomerId({ customer: 'cust_3' })).toBe('cust_3');
  });
  it('reads nested customer.id field', () => {
    expect(extractCustomerId({ customer: { id: 'cust_4', email: 'a@b.com' } })).toBe('cust_4');
  });
  it('returns null for legacy top-level customerId / customer_id (regression guard)', () => {
    expect(extractCustomerId({ customerId: 'cust_1' })).toBeNull();
    expect(extractCustomerId({ customer_id: 'cust_2' })).toBeNull();
  });
  it('returns null when absent', () => {
    expect(extractCustomerId({ status: 'active' })).toBeNull();
    expect(extractCustomerId(null)).toBeNull();
  });
});

describe('extractUserIdFromMetadata', () => {
  it('reads metadata.user_id', () => {
    expect(extractUserIdFromMetadata({ metadata: { user_id: 'u1' } })).toBe('u1');
  });
  it('reads metadata.userId', () => {
    expect(extractUserIdFromMetadata({ metadata: { userId: 'u2' } })).toBe('u2');
  });
  it('falls back to request_id', () => {
    expect(extractUserIdFromMetadata({ request_id: 'u3' })).toBe('u3');
  });
  it('returns null when absent', () => {
    expect(extractUserIdFromMetadata({})).toBeNull();
  });
});

describe('extractProductId', () => {
  // SubscriptionEntity.product 是 oneOf [string, ProductEntity]——同 extractCustomerId
  // 一样删了 productId / product_id fallback（OpenAPI 不声明，实测 payload 不出现）。
  it('reads string product field', () => {
    expect(extractProductId({ product: 'prod_str' })).toBe('prod_str');
  });
  it('reads nested product.id', () => {
    expect(extractProductId({ product: { id: 'prod_3' } })).toBe('prod_3');
  });
  it('returns null for legacy top-level productId / product_id (regression guard)', () => {
    expect(extractProductId({ productId: 'prod_1' })).toBeNull();
    expect(extractProductId({ product_id: 'prod_2' })).toBeNull();
  });
});

describe('planFromProductId', () => {
  it('maps monthly id', () => {
    expect(planFromProductId('prod_m', 'prod_m', 'prod_y')).toBe('monthly');
  });
  it('maps yearly id', () => {
    expect(planFromProductId('prod_y', 'prod_m', 'prod_y')).toBe('yearly');
  });
  it('returns null for unknown id', () => {
    expect(planFromProductId('prod_x', 'prod_m', 'prod_y')).toBeNull();
    expect(planFromProductId(null, 'prod_m', 'prod_y')).toBeNull();
  });
});

describe('extractPeriodEnd', () => {
  // Creem SubscriptionEntity.current_period_end_date 是带 _date 后缀的 ISO string。
  // 旧字段名 `currentPeriodEnd` / `current_period_end` 在实测 payload 中**永远不会出现**——
  // OpenAPI 全文 snake_case 也没声明，保留 fallback 是死代码。
  // 来源：https://docs.creem.io/api-reference/openapi.json SubscriptionEntity
  it('reads current_period_end_date (ISO string)', () => {
    expect(extractPeriodEnd({ current_period_end_date: '2026-06-15T00:00:00Z' })).toBe(
      '2026-06-15T00:00:00Z',
    );
  });
  it('returns null for legacy field names (camelCase or no _date suffix)', () => {
    // 防回归：删掉的旧 fallback 不能被悄悄加回
    expect(extractPeriodEnd({ currentPeriodEnd: '2026-06-15T00:00:00Z' })).toBeNull();
    expect(extractPeriodEnd({ current_period_end: '2026-06-15T00:00:00Z' })).toBeNull();
  });
  it('returns null when absent', () => {
    expect(extractPeriodEnd({})).toBeNull();
    expect(extractPeriodEnd(null)).toBeNull();
  });
});

describe('extractPeriodStart', () => {
  it('reads current_period_start_date', () => {
    expect(extractPeriodStart({ current_period_start_date: '2026-05-10T00:00:00Z' })).toBe(
      '2026-05-10T00:00:00Z',
    );
  });
  it('returns null for legacy field names', () => {
    expect(extractPeriodStart({ currentPeriodStart: '2026-05-10T00:00:00Z' })).toBeNull();
    expect(extractPeriodStart({ current_period_start: '2026-05-10T00:00:00Z' })).toBeNull();
  });
});

describe('createCheckoutSession discountCode body shape', () => {
  function mockCreemOk() {
    return vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ id: 'ck_abc', checkout_url: 'https://creem/p/ck_abc', status: 'pending' }),
      );
  }

  it('omits discount_code from body when discountCode is not provided', async () => {
    const spy = mockCreemOk();
    await createCheckoutSession({
      apiKey: 'creem_test_key',
      productId: 'prod_x',
      requestId: 'u1',
      successUrl: 'https://rewrite.so/settings?billing=ok',
      customerEmail: 'u@test.com',
    });
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('discount_code');
    expect(body).toMatchObject({ product_id: 'prod_x', request_id: 'u1' });
  });

  it('passes discount_code into the body when provided', async () => {
    const spy = mockCreemOk();
    await createCheckoutSession({
      apiKey: 'creem_test_key',
      productId: 'prod_x',
      requestId: 'u1',
      successUrl: 'https://rewrite.so/settings?billing=ok',
      customerEmail: 'u@test.com',
      discountCode: 'EARLYBIRD_LIFETIME_70OFF',
    });
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.discount_code).toBe('EARLYBIRD_LIFETIME_70OFF');
  });
});
