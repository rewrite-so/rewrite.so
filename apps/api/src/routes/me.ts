import { Hono } from 'hono';
import { z } from 'zod';
import { createAuth } from '../lib/auth.ts';
import { encryptApiKey } from '../lib/crypto.ts';
import {
  getUsage,
  hashIp,
  resolveUserTier,
  type Subject,
  type Tier,
} from '../lib/quota.ts';
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
    tier = await resolveUserTier(c.env.DB, userId);
    kind = tier === 'pro' ? 'pro' : 'free';
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
 * 返回当前登录用户信息 + 当前订阅摘要（未登录返 user:null）。
 */
meRoute.get('/v1/me', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ user: null, subscription: null });

  const sub = await c.env.DB.prepare(
    `SELECT plan, status, current_period_end, cancel_at_period_end
       FROM subscriptions
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 1`,
  )
    .bind(session.user.id)
    .first<{
      plan: string;
      status: string;
      current_period_end: number;
      cancel_at_period_end: number;
    }>();

  const tier = await resolveUserTier(c.env.DB, session.user.id);

  return c.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
    tier, // 'free' | 'pro'
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          currentPeriodEnd: new Date(sub.current_period_end).toISOString(),
          cancelAtPeriodEnd: sub.cancel_at_period_end === 1,
        }
      : null,
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

// ============================================================
// BYOK
// ============================================================

const ByokPutSchema = z
  .object({
    baseUrl: z.string().url().max(200),
    model: z.string().min(1).max(100),
    apiKey: z.string().min(8).max(500),
  })
  .strict();

interface ByokRow {
  base_url: string;
  model: string;
  key_mask: string;
  updated_at: number;
}

/**
 * GET /v1/me/byok
 *
 * 返回当前 BYOK 配置（base_url / model / 末 4 位 mask），不返明文 key。
 * 没配过返 { configured: false }。
 */
meRoute.get('/v1/me/byok', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  const row = await c.env.DB.prepare(
    'SELECT base_url, model, key_mask, updated_at FROM byok_keys WHERE user_id = ?',
  )
    .bind(session.user.id)
    .first<ByokRow>();

  if (!row) return c.json({ configured: false });
  return c.json({
    configured: true,
    baseUrl: row.base_url,
    model: row.model,
    keyMask: row.key_mask,
    updatedAt: new Date(row.updated_at).toISOString(),
  });
});

/**
 * PUT /v1/me/byok
 *
 * 设置或替换 BYOK 配置。需登录 + Pro 订阅（订阅校验在路由内做）。
 * apiKey 仅传输不存明文，AES-GCM 加密后存。
 */
meRoute.put('/v1/me/byok', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  // 仅 Pro 用户能用 BYOK（产品决策；MVP 没有"BYOK 不需要订阅"的免费档）
  const tier = await resolveUserTier(c.env.DB, session.user.id);
  if (tier !== 'pro') {
    return c.json({ error: 'pro_required' }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const parsed = ByokPutSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: parsed.error.issues[0]?.message }, 400);
  }
  const { baseUrl, model, apiKey } = parsed.data;

  let enc: { encrypted: string; iv: string; mask: string };
  try {
    enc = await encryptApiKey(apiKey, c.env.BYOK_MASTER_KEY);
  } catch (err) {
    console.error('[byok.put] encrypt failed', err);
    return c.json({ error: 'encrypt_failed' }, 500);
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO byok_keys (
        user_id, base_url, model, encrypted_api_key, iv, key_version, key_mask, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       base_url = excluded.base_url,
       model = excluded.model,
       encrypted_api_key = excluded.encrypted_api_key,
       iv = excluded.iv,
       key_version = excluded.key_version,
       key_mask = excluded.key_mask,
       updated_at = excluded.updated_at`,
  )
    .bind(session.user.id, baseUrl, model, enc.encrypted, enc.iv, enc.mask, now, now)
    .run();

  return c.json({ configured: true, baseUrl, model, keyMask: enc.mask });
});

/**
 * DELETE /v1/me/byok
 *
 * 删除 BYOK 配置。删除后 /v1/rewrite 自动回到平台默认 upstream + 计入月配额。
 */
meRoute.delete('/v1/me/byok', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  await c.env.DB.prepare('DELETE FROM byok_keys WHERE user_id = ?').bind(session.user.id).run();
  return c.json({ configured: false });
});
