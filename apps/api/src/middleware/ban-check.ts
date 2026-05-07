/**
 * Ban check middleware — 在 better-auth session 解析后、所有需要登录态的业务路由
 * 之前执行。命中 user_bans（且未过期）→ 返 401 { error: 'user_banned', reason }。
 *
 * 设计：
 * - 不挂在 app.use('*') 全量层，避免拖慢 /health 等无 session 端点；改为只挂在
 *   /v1/me/* 和 /v1/billing/* 这类登录态路由的 prefix（详见 index.ts）。
 * - /v1/rewrite 同时支持登录与匿名，匿名 install/IP 路径不能被 user_bans 阻断；
 *   因此 /v1/rewrite 路由内部在解出 session.user.id 后单独调 isUserBanned() 检查。
 *
 * KV 缓存（5min TTL，sentinel 防穿透；admin worker 写表后 KV.delete 失效）：
 * 减少热路径多一次 D1 SELECT 的开销。低基数表（封禁用户极少）+ 低写入频率 → 缓存安全。
 */
import type { Context, MiddlewareHandler } from 'hono';
import { createAuth } from '../lib/auth.ts';
import type { AppEnv } from '../types.ts';

const BAN_CACHE_PREFIX = 'ban:';
const BAN_CACHE_TTL_SEC = 300;
const BAN_NONE_SENTINEL = '__none__';

interface BanRow {
  reason: string;
  expires_at: number | null;
}

async function readBanCache(
  kv: KVNamespace | undefined,
  userId: string,
): Promise<BanRow | null | undefined> {
  if (!kv || typeof kv.get !== 'function') return undefined;
  let cached: string | null;
  try {
    cached = await kv.get(`${BAN_CACHE_PREFIX}${userId}`);
  } catch {
    // KV outage / serialization error → treat as cache miss, fall through to D1
    return undefined;
  }
  if (cached === null) return undefined;
  if (cached === BAN_NONE_SENTINEL) return null;
  try {
    return JSON.parse(cached) as BanRow;
  } catch {
    return undefined;
  }
}

async function writeBanCache(
  kv: KVNamespace | undefined,
  userId: string,
  value: BanRow | null,
): Promise<void> {
  if (!kv || typeof kv.put !== 'function') return;
  const body = value === null ? BAN_NONE_SENTINEL : JSON.stringify(value);
  try {
    await kv.put(`${BAN_CACHE_PREFIX}${userId}`, body, {
      expirationTtl: BAN_CACHE_TTL_SEC,
    });
  } catch {
    // best-effort cache write
  }
}

/**
 * 查 user_bans 是否命中。返回 ban row（含 reason）或 null（未封禁 / 已过期）。
 * 暴露为 helper 便于 /v1/rewrite 在登录分支内单独调用（middleware 拦截 anonymous 不便）。
 */
export async function isUserBanned(
  db: D1Database,
  kv: KVNamespace | undefined,
  userId: string,
): Promise<BanRow | null> {
  const now = Date.now();

  let ban = await readBanCache(kv, userId);
  if (ban === undefined) {
    const row = await db
      .prepare(`SELECT reason, expires_at FROM user_bans WHERE user_id = ? LIMIT 1`)
      .bind(userId)
      .first<{ reason: string; expires_at: number | null }>();
    ban = row ? { reason: row.reason, expires_at: row.expires_at } : null;
    await writeBanCache(kv, userId, ban).catch(() => undefined);
  }

  if (!ban) return null;
  // expires_at IS NULL = 永封；否则比较时间（DB 存 Unix seconds）
  const expiresMs = ban.expires_at == null ? null : ban.expires_at * 1000;
  if (expiresMs != null && expiresMs <= now) return null;
  return ban;
}

/**
 * Hono middleware：要求当前请求已通过 better-auth 解析出 user，否则放行（说明是
 * 匿名/未登录路径，不属于 ban 治理范围；比如 /v1/me/usage?installId=... 走匿名分支
 * 时无 session）。session 内有 user_id 时查 user_bans，命中返 401。
 */
export function banCheckMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = await tryGetUserId(c);
    if (!userId) return next();

    const ban = await isUserBanned(c.env.DB, c.env.KV, userId);
    if (ban) {
      return c.json({ error: 'user_banned', reason: ban.reason }, 401);
    }
    return next();
  };
}

async function tryGetUserId(c: Context<AppEnv>): Promise<string | null> {
  try {
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return session?.user.id ?? null;
  } catch {
    // Session resolution failure should not bypass ban; treat as anonymous and let
    // downstream route reject if it needs auth.
    return null;
  }
}
