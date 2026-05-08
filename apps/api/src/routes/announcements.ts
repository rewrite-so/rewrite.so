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
 * - **不缓存**：announcements 表 active 行极少（运营手动写公告，月度计），D1
 *   单次查询 O(active_rows) 即可，不需要 KV cache。这样 admin 写表后立即对所有
 *   读路径生效，无需任何 cache invalidation 协议。
 */
import { LOCALES } from '@rewrite/shared';
import { Hono } from 'hono';
import { resolveUserTier } from '../lib/quota.ts';
import { getOrResolveUserId } from '../lib/session-cache.ts';
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

const SUPPORTED_LOCALES = new Set<string>(LOCALES);
const SUPPORTED_SURFACES = new Set(['web', 'extension']);
const RESPONSE_MAX_AGE_SEC = 60;

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
  // getOrResolveUserId 复用本请求生命周期内已缓存的 session 结果（如果挂在前面的
  // middleware 跑过的话）；announcements 端点目前没挂 ban-check，第一次调用会真去查。
  let resolvedTier: 'anonymous' | 'free' | 'pro' = 'anonymous';
  const userId = await getOrResolveUserId(c);
  if (userId) {
    const tier = await resolveUserTier(c.env.DB, userId, c.env.KV);
    resolvedTier = tier === 'pro' ? 'pro' : 'free';
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

  // 客户端可缓存 60s（公告时效粒度足够），admin 改动等下次浏览器请求即可读到。
  return c.json({ items }, 200, { 'cache-control': `public, max-age=${RESPONSE_MAX_AGE_SEC}` });
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
