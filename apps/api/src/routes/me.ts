import { Hono } from 'hono';
import { z } from 'zod';
import { createAuth } from '../lib/auth.ts';
import { getUsage, hashIp, type Subject, type Tier } from '../lib/quota.ts';
import type { AppEnv } from '../types.ts';

export const meRoute = new Hono<AppEnv>();

interface UserSettingsRow {
  target_lang: string;
  ui_locale: string;
}

const SettingsPatchSchema = z
  .object({
    targetLang: z.string().min(1).max(20).optional(),
    uiLocale: z.enum(['auto', 'zh-CN', 'en']).optional(),
  })
  .strict();

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

/**
 * GET /v1/me/settings
 * 返回当前登录用户的偏好（target_lang / ui_locale）。
 * 未登录返 401 unauthorized。
 */
meRoute.get('/v1/me/settings', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  const row = await c.env.DB.prepare(
    'SELECT target_lang, ui_locale FROM user_settings WHERE user_id = ?',
  )
    .bind(session.user.id)
    .first<UserSettingsRow>();

  return c.json({
    targetLang: row?.target_lang ?? 'auto',
    uiLocale: row?.ui_locale ?? 'auto',
  });
});

/**
 * PATCH /v1/me/settings
 * 增量更新偏好。未登录返 401。
 */
meRoute.patch('/v1/me/settings', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const parsed = SettingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: parsed.error.issues[0]?.message }, 400);
  }

  // 先读现值，merge patch，再 upsert（避免 SQL UPSERT 时 null 默认值覆盖未传字段）
  const current = await c.env.DB.prepare(
    'SELECT target_lang, ui_locale FROM user_settings WHERE user_id = ?',
  )
    .bind(session.user.id)
    .first<UserSettingsRow>();

  const targetLang = parsed.data.targetLang ?? current?.target_lang ?? 'auto';
  const uiLocale = parsed.data.uiLocale ?? current?.ui_locale ?? 'auto';
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO user_settings (user_id, target_lang, ui_locale, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       target_lang = excluded.target_lang,
       ui_locale = excluded.ui_locale,
       updated_at = excluded.updated_at`,
  )
    .bind(session.user.id, targetLang, uiLocale, now)
    .run();

  return c.json({ targetLang, uiLocale });
});
