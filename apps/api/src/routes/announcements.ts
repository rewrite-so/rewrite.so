/**
 * GET /v1/announcements?locale=&surface=
 *
 * 返回当前生效的 announcement 列表，供 web / extension 渲染 banner 或 modal。
 *
 * 关键设计：
 * - tier_filter 由服务端从 better-auth session 解析（匿名 → 'anonymous' → 仅看
 *   tier_filter IS NULL 的通用公告）。**绝不接受 client ?tier= 参数** —— 否则
 *   任意访客可探测 'pro' 专属公告，泄露运营策略。
 * - locale / surface 接受 client 参数（locale 是 UI 语言，surface 是来源
 *   'web'/'extension'，无泄露风险）。
 * - KV 缓存 60s（key 含 locale + surface + resolved_tier + 当前 5min 时间桶
 *   防 stale 公告时间窗外渗透）。admin 仓库 CRUD 后 KV.delete('announcements:*')
 *   即可强失效——但 60s 窗口内的请求允许 stale。
 */
import { Hono } from 'hono';
import { createAuth } from '../lib/auth.ts';
import { resolveUserTier } from '../lib/quota.ts';
import type { AppEnv } from '../types.ts';

export const announcementsRoute = new Hono<AppEnv>();

interface AnnouncementRow {
  id: string;
  kind: string;
  surfaces: string;
  locale_filter: string | null;
  tier_filter: string | null;
  title_i18n: string;
  body_i18n: string;
  cta_i18n: string | null;
  starts_at: number;
  ends_at: number;
  priority: number;
}

interface AnnouncementResponseItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
  endsAt: number;
  priority: number;
}

const CACHE_TTL_SEC = 60;
const CACHE_PREFIX = 'announcements:';
const SUPPORTED_LOCALES = new Set([
  'en',
  'zh-CN',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
]);
const SUPPORTED_SURFACES = new Set(['web', 'extension']);

announcementsRoute.get('/v1/announcements', async (c) => {
  // ===== 解析 query 参数 =====
  const locale = c.req.query('locale') ?? 'en';
  const surface = c.req.query('surface') ?? 'web';
  if (!SUPPORTED_LOCALES.has(locale)) {
    return c.json({ error: 'invalid_locale' }, 400);
  }
  if (!SUPPORTED_SURFACES.has(surface)) {
    return c.json({ error: 'invalid_surface' }, 400);
  }

  // ===== 服务端解析 tier（绝不信任 client） =====
  let resolvedTier: 'anonymous' | 'free' | 'pro' = 'anonymous';
  let userId: string | undefined;
  try {
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    userId = session?.user.id;
  } catch {
    // 无 session / better-auth 异常 → 当作匿名访问
  }
  if (userId) {
    const tier = await resolveUserTier(c.env.DB, userId, c.env.KV);
    resolvedTier = tier === 'pro' ? 'pro' : 'free';
  }

  // ===== KV 缓存 =====
  // 5min bucket 让缓存自然包含「公告刚刚开始/结束」的边界（结合 60s TTL）
  const bucket = Math.floor(Date.now() / (5 * 60_000));
  const cacheKey = `${CACHE_PREFIX}${locale}:${surface}:${resolvedTier}:${bucket}`;

  let cached: string | null = null;
  if (c.env.KV && typeof c.env.KV.get === 'function') {
    try {
      cached = await c.env.KV.get(cacheKey);
    } catch {
      // cache miss
    }
  }
  if (cached !== null) {
    return new Response(cached, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SEC}`,
        'x-rs-cache': 'hit',
      },
    });
  }

  // ===== D1 查询 =====
  // tier_filter NULL = 通用；resolvedTier='anonymous' 时只返 NULL；登录用户拿 NULL +
  // 自己 tier 的（不会拿到不属于自己 tier 的）
  const nowSec = Math.floor(Date.now() / 1000);
  const tierClause =
    resolvedTier === 'anonymous'
      ? 'tier_filter IS NULL'
      : '(tier_filter IS NULL OR tier_filter = ?)';
  const localeClause = '(locale_filter IS NULL OR locale_filter = ?)';

  const sql = `
    SELECT id, kind, surfaces, locale_filter, tier_filter, title_i18n, body_i18n,
           cta_i18n, starts_at, ends_at, priority
      FROM announcements
     WHERE starts_at <= ?
       AND ends_at   >  ?
       AND ${tierClause}
       AND ${localeClause}
     ORDER BY priority DESC, starts_at DESC
     LIMIT 20
  `;
  const params: unknown[] = [nowSec, nowSec];
  if (resolvedTier !== 'anonymous') params.push(resolvedTier);
  params.push(locale);

  const stmt = c.env.DB.prepare(sql).bind(...params);
  const rows = await stmt.all<AnnouncementRow>();
  const items: AnnouncementResponseItem[] = (rows.results ?? [])
    .filter((r) => surfaceMatches(r.surfaces, surface))
    .map((r) => projectForLocale(r, locale))
    .filter((x): x is AnnouncementResponseItem => x !== null);

  const body = JSON.stringify({ items });

  // 写缓存（best-effort）
  if (c.env.KV && typeof c.env.KV.put === 'function') {
    try {
      await c.env.KV.put(cacheKey, body, { expirationTtl: CACHE_TTL_SEC });
    } catch {
      // ignore
    }
  }

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL_SEC}`,
      'x-rs-cache': 'miss',
    },
  });
});

function surfaceMatches(surfacesJson: string, target: string): boolean {
  try {
    const arr = JSON.parse(surfacesJson);
    return Array.isArray(arr) && arr.includes(target);
  } catch {
    return false;
  }
}

function projectForLocale(row: AnnouncementRow, locale: string): AnnouncementResponseItem | null {
  const title = pickI18n(row.title_i18n, locale);
  const body = pickI18n(row.body_i18n, locale);
  if (!title || !body) return null;

  const cta = row.cta_i18n ? pickCta(row.cta_i18n, locale) : undefined;

  return {
    id: row.id,
    kind: row.kind,
    title,
    body,
    ...(cta ? { cta } : {}),
    endsAt: row.ends_at,
    priority: row.priority,
  };
}

function pickI18n(json: string, locale: string): string | null {
  try {
    const obj = JSON.parse(json) as Record<string, string>;
    return obj[locale] ?? obj.en ?? null;
  } catch {
    return null;
  }
}

function pickCta(json: string, locale: string): { label: string; href: string } | undefined {
  try {
    const obj = JSON.parse(json) as Record<string, { label: string; href: string }>;
    const v = obj[locale] ?? obj.en;
    if (!v?.label || !v.href) return undefined;
    return { label: v.label, href: v.href };
  } catch {
    return undefined;
  }
}
