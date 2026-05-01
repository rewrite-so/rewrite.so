import { Hono } from 'hono';
import { createAuth } from '../lib/auth.ts';
import { getUsage, hashIp, type Subject, type Tier } from '../lib/quota.ts';
import type { AppEnv } from '../types.ts';

export const meRoute = new Hono<AppEnv>();

/**
 * GET /v1/me/usage
 *
 * 返回当前 subject 的月配额状态（已用 / 上限 / 剩余 / 月底重置时间 / tier）。
 * Subject 选择规则与 /v1/rewrite 一致。
 *
 * Query: ?installId=xxx （扩展未登录时带上）
 */
meRoute.get('/v1/me/usage', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const userId = session?.user.id;
  const installId = c.req.query('installId');

  let subject: Subject;
  let tier: Tier;
  let kind: 'free' | 'pro' | 'anonymous' | 'anonymous_install';

  if (userId) {
    subject = { kind: 'user', id: userId };
    tier = 'free'; // Phase 4 接 subscriptions
    kind = 'free';
  } else if (installId) {
    subject = { kind: 'install', id: installId };
    tier = 'anonymous_install';
    kind = 'anonymous_install';
  } else {
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      '0.0.0.0';
    const ipHash = await hashIp(ip, c.env.BETTER_AUTH_SECRET);
    subject = { kind: 'ip', id: ipHash };
    tier = 'anonymous_ip';
    kind = 'anonymous';
  }

  const usage = await getUsage(c.env.DB, subject, tier);

  return c.json({
    used: usage.used,
    limit: usage.limit,
    remaining: usage.remaining,
    resetAt: usage.resetAt,
    tier: kind,
  });
});

/**
 * GET /v1/me
 * 返回当前登录用户信息（未登录返 null）。
 */
meRoute.get('/v1/me', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ user: null });
  return c.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
  });
});
