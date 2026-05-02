/**
 * Unsubscribe token: HMAC-SHA256(secret, "unsub:" + userId), hex.
 *
 * Why HMAC over storing tokens in DB:
 * - One round-trip less (token is verifiable from userId alone).
 * - No table cleanup needed.
 * - Tokens don't expire (correct: a user might click an unsubscribe from a
 *   year-old email; we should still honor it).
 * - Replay-safe because the action is idempotent.
 *
 * Cost: if BETTER_AUTH_SECRET is rotated, all old unsubscribe links break.
 *   That's acceptable; we'd resync state via the dashboard.
 */

const PREFIX = 'unsub:';

export async function makeUnsubscribeToken(userId: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(PREFIX + userId));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * Verify an unsubscribe token. Returns the userId if valid, null otherwise.
 *
 * Caller has the userId already? Use the constant-time `verify` form below.
 * Public unsubscribe page only has the token — caller passes a candidate
 * userId list (e.g. by querying users by token-derived hash bucket) — but
 * since HMAC isn't reversible, the token must be paired with userId in the
 * URL. We expect URL: /unsubscribe?token=<tok>&user=<id>.
 */
export async function verifyUnsubscribeToken(
  token: string,
  userId: string,
  secret: string,
): Promise<boolean> {
  const expected = await makeUnsubscribeToken(userId, secret);
  return timingSafeEqual(token, expected);
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}
