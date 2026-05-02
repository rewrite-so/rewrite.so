import { Hono } from 'hono';
import { verifyUnsubscribeToken } from '../emails/unsubscribe.ts';
import { log } from '../lib/log.ts';
import type { AppEnv } from '../types.ts';

export const unsubscribeRoute = new Hono<AppEnv>();

/**
 * POST /v1/unsubscribe — body: { user, token }
 *
 * Mark user as unsubscribed from onboarding emails. Idempotent.
 * Transactional emails (login links, billing receipts, password resets) are
 * separate and continue to work — that's required by both CAN-SPAM and
 * GDPR.
 *
 * Also handles RFC 8058 List-Unsubscribe-Post (Gmail / Apple Mail one-click
 * unsubscribe) — those send POST with empty body but the URL includes
 * ?user=&token= query params. We accept either form.
 */
unsubscribeRoute.post('/v1/unsubscribe', async (c) => {
  const url = new URL(c.req.url);
  const queryUser = url.searchParams.get('user');
  const queryToken = url.searchParams.get('token');

  let userId = queryUser;
  let token = queryToken;

  // Fall back to JSON body for the in-app form
  if (!userId || !token) {
    try {
      const body = (await c.req.json()) as { user?: string; token?: string };
      userId = userId ?? body.user ?? null;
      token = token ?? body.token ?? null;
    } catch {
      // ignore — empty body is fine for List-Unsubscribe-Post if URL has params
    }
  }

  if (!userId || !token) {
    return c.json({ error: 'missing_params' }, 400);
  }

  const ok = await verifyUnsubscribeToken(token, userId, c.env.BETTER_AUTH_SECRET);
  if (!ok) {
    log.warn('unsubscribe.invalid_token', { userId });
    return c.json({ error: 'invalid_token' }, 401);
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO user_email_state (user_id, unsubscribed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       unsubscribed_at = excluded.unsubscribed_at,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, now, now, now)
    .run();

  log.info('unsubscribe.success', { userId });
  return c.json({ ok: true, unsubscribed: true });
});
