import { describe, expect, it } from 'vitest';
import {
  extractCustomerId,
  extractPeriodEnd,
  extractProductId,
  extractUserIdFromMetadata,
  planFromProductId,
  verifyWebhookSignature,
} from './creem.ts';

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
  it('reads customerId field', () => {
    expect(extractCustomerId({ customerId: 'cust_1' })).toBe('cust_1');
  });
  it('reads customer_id field', () => {
    expect(extractCustomerId({ customer_id: 'cust_2' })).toBe('cust_2');
  });
  it('reads string customer field', () => {
    expect(extractCustomerId({ customer: 'cust_3' })).toBe('cust_3');
  });
  it('reads nested customer.id field', () => {
    expect(extractCustomerId({ customer: { id: 'cust_4', email: 'a@b.com' } })).toBe('cust_4');
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
  it('reads productId', () => {
    expect(extractProductId({ productId: 'prod_1' })).toBe('prod_1');
  });
  it('reads product_id', () => {
    expect(extractProductId({ product_id: 'prod_2' })).toBe('prod_2');
  });
  it('reads nested product.id', () => {
    expect(extractProductId({ product: { id: 'prod_3' } })).toBe('prod_3');
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
  it('reads camelCase', () => {
    expect(extractPeriodEnd({ currentPeriodEnd: '2026-06-15T00:00:00Z' })).toBe(
      '2026-06-15T00:00:00Z',
    );
  });
  it('reads snake_case', () => {
    expect(extractPeriodEnd({ current_period_end: '2026-06-15T00:00:00Z' })).toBe(
      '2026-06-15T00:00:00Z',
    );
  });
});
