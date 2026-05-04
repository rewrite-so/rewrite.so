import { Hono } from 'hono';
import { z } from 'zod';
import { BURST_BUCKETS, consume } from '../do/rate-limiter.ts';
import { createAuth } from '../lib/auth.ts';
import { encryptApiKey } from '../lib/crypto.ts';
import { log } from '../lib/log.ts';
import {
  claimAnonymousUsage,
  getUsage,
  hashIp,
  resolveUserTier,
  type Subject,
  type Tier,
} from '../lib/quota.ts';
import { sanitizeTargetLang } from '../lib/sanitize-target-lang.ts';
import type { AppEnv } from '../types.ts';

export const meRoute = new Hono<AppEnv>();

interface UserSettingsRow {
  target_lang: string;
  ui_locale: string;
}

const SettingsPatchSchema = z
  .object({
    targetLang: z.string().min(1).max(50).optional(),
    uiLocale: z.enum(['auto', 'en', 'zh-CN', 'ja', 'ko', 'es', 'fr', 'de']).optional(),
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

  // Lazy sanitize 老数据：v0.1.x 之前的 SettingsClient 用 hardcoded 8 项下拉，
  // 历史 DB 中无非法字符；但读路径仍跑一遍作为防御纵深，防误入脏数据。
  const rawTarget = row?.target_lang ?? 'auto';
  const targetLang = rawTarget === 'auto' ? 'auto' : sanitizeTargetLang(rawTarget) || 'auto';
  return c.json({
    targetLang,
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

  // sanitize 任何即将写入 DB 并最终注入 prompt 的 targetLang —— 自定义自然语言
  // 描述（"Portuguese (Brazilian)" / "粤语"）也走同一路径
  const rawTargetLang = parsed.data.targetLang ?? current?.target_lang ?? 'auto';
  const cleanedTargetLang = sanitizeTargetLang(rawTargetLang);
  if (cleanedTargetLang.length === 0) {
    return c.json({ error: 'invalid_input', detail: 'targetLang empty after sanitize' }, 400);
  }
  const targetLang = cleanedTargetLang;
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
// 配额合并：匿名（installId）→ 登录用户
// ============================================================

const ClaimInstallSchema = z
  .object({
    installId: z.string().min(8).max(64),
  })
  .strict();

/**
 * POST /v1/me/claim-install
 *
 * 扩展 content script 在用户登录后调用一次。把当月 ('install', installId) 维度的
 * count 加到 ('user', userId) 维度。靠 usage_claims 表 PK 幂等，重复调用 no-op。
 *
 * 这是兑现 CLAUDE.md / migrations/0001_init.sql 里"登录后 install 配额合并"承诺的实现。
 * 以前没有这一步，匿名扩展用户用完 5/5 → 注册 → 拿到全新 30/30，是绕匿名档位的滥用通道。
 */
meRoute.post('/v1/me/claim-install', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  // 防止脚本用随机 installId 灌 usage_claims 表（5 req/min/user）。每个登录用户
  // 每月理论只该调 1-2 次（首次登录 + 跨月）；正常 bootstrap 重复调因服务端 PK 幂等
  // 不写新行但仍会消耗 token bucket。容量足够多个 tab 同时启动，但拦得住脚本滥用。
  const subject: Subject = { kind: 'user', id: session.user.id };
  const burst = await consume(c.env.RATE_LIMITER, subject, BURST_BUCKETS.claimInstall);
  if (!burst.allowed) {
    return c.json({ error: 'rate_limit', retryAfterMs: burst.retryAfterMs }, 429, {
      'retry-after': String(Math.ceil(burst.retryAfterMs / 1000)),
    });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const parsed = ClaimInstallSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', detail: parsed.error.issues[0]?.message }, 400);
  }

  const result = await claimAnonymousUsage(c.env.DB, session.user.id, {
    kind: 'install',
    id: parsed.data.installId,
  });

  return c.json({
    merged: result.merged,
    applied: result.applied,
  });
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
 * 设置或替换 BYOK 配置。需登录；免费登录用户也可配置。
 * apiKey 仅传输不存明文，AES-GCM 加密后存。
 */
meRoute.put('/v1/me/byok', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  // 任何登录用户均可配 BYOK（产品决策）；Pro 的差异化是 hosted model（2000/月）+
  // 不用管 key + Priority，而非"是否能用 BYOK"
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
    log.error('byok.encrypt_failed', { err });
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

/**
 * POST /v1/me/byok/test
 *
 * 让用户在保存 BYOK 配置前先验证 baseUrl / model / apiKey 真的能调通。
 * - **不存 DB**，只用提交的明文 key 发一次极小 chat completions 请求
 * - 8s 超时（用户等不久；超时通常意味着 baseUrl 不可达）
 * - 仅登录用户可调（防匿名滥用作 base URL 探测）
 * - **不写日志、不计配额**：key 是用户的，不要让它落任何地方
 */
const ByokTestSchema = z
  .object({
    baseUrl: z
      .string()
      .url()
      .max(200)
      // 用户常误把完整 endpoint 当 base URL；提示更准确的错误而不是让它 404
      .refine((url) => !/\/chat\/completions\/?$/i.test(url), {
        message: 'base URL should not include /chat/completions',
      }),
    model: z.string().min(1).max(100),
    apiKey: z.string().min(8).max(500),
  })
  .strict();

meRoute.post('/v1/me/byok/test', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  // 比生产严格的 rate limit：10 req/min/user —— 配置态不该频繁打，且
  // 防止登录用户用我们 worker IP 做 SSRF / DDoS amplification（任意 baseUrl 都能 fetch）
  const subject: Subject = { kind: 'user', id: session.user.id };
  const burst = await consume(c.env.RATE_LIMITER, subject, BURST_BUCKETS.byokTest);
  if (!burst.allowed) {
    return c.json({ error: 'rate_limit', retryAfterMs: burst.retryAfterMs }, 429, {
      'retry-after': String(Math.ceil(burst.retryAfterMs / 1000)),
    });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const parsed = ByokTestSchema.safeParse(body);
  if (!parsed.success) {
    // 把 zod 的 refine error 当 invalid_base_url 透传给客户端，让 UI 能精确归因
    const issue = parsed.error.issues[0];
    if (issue?.message.includes('chat/completions')) {
      return c.json({ ok: false, error: 'invalid_base_url' });
    }
    return c.json({ error: 'invalid_input', detail: issue?.message }, 400);
  }
  const { baseUrl, model, apiKey } = parsed.data;

  const t0 = performance.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
        stream: false,
      }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    const latencyMs = Math.round(performance.now() - t0);

    if (res.ok) return c.json({ ok: true, latencyMs });
    if (res.status === 401) return c.json({ ok: false, error: 'unauthorized' });
    if (res.status === 403) return c.json({ ok: false, error: 'forbidden' });
    if (res.status === 404) return c.json({ ok: false, error: 'model_not_found' });
    if (res.status === 429) return c.json({ ok: false, error: 'rate_limited' });
    return c.json({ ok: false, error: `upstream_${res.status}` });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') return c.json({ ok: false, error: 'timeout' });
    return c.json({ ok: false, error: 'unreachable' });
  }
});
