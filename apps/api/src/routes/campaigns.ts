/**
 * Campaigns — 通用运营活动公开端点。
 *
 * - GET  /v1/campaigns/:slug          公开（带 session 时返回 viewer.joined）
 * - POST /v1/campaigns/:slug/join     必须登录；落 perks（gift_grants +
 *                                     user_discounts）+ participation
 *
 * 设计要点：
 * - 报名「先 SELECT existing 再 batch 写 perks + participation」，全部
 *   INSERT OR IGNORE 让 PK 冲突幂等。perks 使用确定性 id 让 batch 失败重试
 *   不会写双份。
 * - 「报名时已 Pro + 已有 active gift」用统一公式 `granted_at = max(now,
 *   subEnd, currentMaxGiftExpiresAt)`，避免与现有 Pro 期重叠浪费。
 * - 缓存：GET 走 KV `campaign:<slug>` 60s TTL，admin 改活动后 invalidate；
 *   POST batch 成功后显式 invalidate `gift_active:<userId>` 让 tier 查询立刻反映新 grant。
 */
import {
  type CampaignI18n,
  CampaignI18nSchema,
  CampaignSlugSchema,
  type CampaignType,
  type EarlyBirdConfig,
  EarlyBirdConfigSchema,
} from '@rewrite/shared';
import { Hono } from 'hono';
import { BURST_BUCKETS, consume } from '../do/rate-limiter.ts';
import { hashSubjectId, validateEventProps, writeEventPoint } from '../lib/event-metrics.ts';
import { computeGrantId } from '../lib/gift-grants.ts';
import { log } from '../lib/log.ts';
import { GIFT_ACTIVE_CACHE_PREFIX, resolveUserTier } from '../lib/quota.ts';
import { getOrResolveSessionUser } from '../lib/session-cache.ts';
import { extendProLapsesAt } from '../lib/user-discounts.ts';
import type { AppEnv } from '../types.ts';

export const campaignsRoute = new Hono<AppEnv>();

const CAMPAIGN_CACHE_PREFIX = 'campaign:';
const CAMPAIGN_CACHE_TTL_SEC = 60;
const MS_PER_DAY = 86_400_000;

interface CampaignRow {
  id: string;
  type: string;
  slug: string;
  enabled: number;
  show_homepage_badge: number;
  starts_at: number;
  ends_at: number;
  capacity: number | null;
  config_json: string;
  i18n_json: string;
}

interface ParsedCampaign {
  id: string;
  type: CampaignType;
  slug: string;
  enabled: boolean;
  show_homepage_badge: boolean;
  starts_at: number;
  ends_at: number;
  capacity: number | null;
  config: Record<string, unknown>;
  i18n: CampaignI18n;
}

async function readCampaignFromCache(
  kv: KVNamespace | undefined,
  slug: string,
): Promise<ParsedCampaign | null | undefined> {
  if (!kv || typeof kv.get !== 'function') return undefined;
  let cached: string | null;
  try {
    cached = await kv.get(`${CAMPAIGN_CACHE_PREFIX}${slug}`);
  } catch {
    return undefined;
  }
  if (cached === null) return undefined;
  if (cached === '__none__') return null;
  try {
    return JSON.parse(cached) as ParsedCampaign;
  } catch {
    return undefined;
  }
}

async function writeCampaignCache(
  kv: KVNamespace | undefined,
  slug: string,
  value: ParsedCampaign | null,
): Promise<void> {
  if (!kv || typeof kv.put !== 'function') return;
  const body = value === null ? '__none__' : JSON.stringify(value);
  try {
    await kv.put(`${CAMPAIGN_CACHE_PREFIX}${slug}`, body, {
      expirationTtl: CAMPAIGN_CACHE_TTL_SEC,
    });
  } catch {
    // best-effort
  }
}

async function fetchCampaignBySlug(db: D1Database, slug: string): Promise<ParsedCampaign | null> {
  const row = await db
    .prepare(
      `SELECT id, type, slug, enabled, show_homepage_badge,
              starts_at, ends_at, capacity, config_json, i18n_json
         FROM campaigns
        WHERE slug = ?
        LIMIT 1`,
    )
    .bind(slug)
    .first<CampaignRow>();
  if (!row) return null;
  let config: Record<string, unknown>;
  let i18n: CampaignI18n;
  try {
    config = JSON.parse(row.config_json);
    i18n = CampaignI18nSchema.parse(JSON.parse(row.i18n_json));
  } catch (err) {
    log.error('campaign.parse_error', { slug, err });
    // 视为脏数据 → 视同不存在；admin 应修复后重写
    return null;
  }
  return {
    id: row.id,
    type: row.type as CampaignType,
    slug: row.slug,
    enabled: row.enabled === 1,
    show_homepage_badge: row.show_homepage_badge === 1,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    capacity: row.capacity,
    config,
    i18n,
  };
}

async function resolveCampaign(
  c: { env: { DB: D1Database; KV: KVNamespace } },
  slug: string,
): Promise<ParsedCampaign | null> {
  const cached = await readCampaignFromCache(c.env.KV, slug);
  if (cached !== undefined) return cached;
  const row = await fetchCampaignBySlug(c.env.DB, slug);
  // 写缓存（行存在 / NULL 都缓存，sentinel 防穿透）
  await writeCampaignCache(c.env.KV, slug, row).catch(() => undefined);
  return row;
}

// ===========================================================================
// GET /v1/campaigns/:slug
// ===========================================================================

campaignsRoute.get('/v1/campaigns/:slug', async (c) => {
  const slugRaw = c.req.param('slug');
  const slugParsed = CampaignSlugSchema.safeParse(slugRaw);
  if (!slugParsed.success) return c.json({ error: 'invalid_slug' }, 400);
  const slug = slugParsed.data;

  const campaign = await resolveCampaign(c, slug);
  if (!campaign) return c.json({ error: 'not_found' }, 404);

  // viewer 状态：仅当请求带有效 session 时填
  let viewer: { joined: boolean; joinedAt: number | null } | undefined;
  const sessionUser = await getOrResolveSessionUser(c);
  if (sessionUser) {
    const partRow = await c.env.DB.prepare(
      `SELECT joined_at FROM campaign_participations WHERE user_id = ? AND campaign_id = ?`,
    )
      .bind(sessionUser.id, campaign.id)
      .first<{ joined_at: number }>();
    viewer = {
      joined: partRow !== null,
      joinedAt: partRow?.joined_at ?? null,
    };
  }

  return c.json({
    slug: campaign.slug,
    type: campaign.type,
    enabled: campaign.enabled,
    show_homepage_badge: campaign.show_homepage_badge,
    starts_at: campaign.starts_at,
    ends_at: campaign.ends_at,
    capacity: campaign.capacity,
    config: campaign.config,
    i18n: campaign.i18n,
    ...(viewer ? { viewer } : {}),
  });
});

// ===========================================================================
// POST /v1/campaigns/:slug/join
// ===========================================================================

campaignsRoute.post('/v1/campaigns/:slug/join', async (c) => {
  const slugRaw = c.req.param('slug');
  const slugParsed = CampaignSlugSchema.safeParse(slugRaw);
  if (!slugParsed.success) return c.json({ error: 'invalid_slug' }, 400);
  const slug = slugParsed.data;

  const sessionUser = await getOrResolveSessionUser(c);
  if (!sessionUser) return c.json({ error: 'unauthorized' }, 401);

  // ===== Rate limit (5/min/user) =====
  const burst = await consume(
    c.env.RATE_LIMITER,
    { kind: 'user', id: sessionUser.id },
    BURST_BUCKETS.campaignJoin,
  );
  if (!burst.allowed) {
    return c.json({ error: 'rate_limit', retryAfterMs: burst.retryAfterMs }, 429, {
      'retry-after': String(Math.ceil(burst.retryAfterMs / 1000)),
    });
  }

  // ===== 取活动并校验时间窗 / capacity =====
  const campaign = await resolveCampaign(c, slug);
  if (!campaign) return c.json({ error: 'not_found' }, 404);

  const now = Date.now();
  if (!campaign.enabled || now > campaign.ends_at) {
    return c.json({ code: 'CAMPAIGN_ENDED', error: 'campaign_ended' }, 410);
  }
  if (now < campaign.starts_at) {
    return c.json({ code: 'CAMPAIGN_NOT_STARTED', error: 'campaign_not_started' }, 425);
  }

  // Phase 1 仅支持 early_bird type；新加 type 时此处分发
  if (campaign.type !== 'early_bird') {
    return c.json({ error: 'unsupported_campaign_type' }, 400);
  }

  // 解析 type-specific config（信任 admin 已写入合法 config，但仍 schema 校验
  // 一次防 SQL 被绕过或历史脏数据）
  const cfgParsed = EarlyBirdConfigSchema.safeParse(campaign.config);
  if (!cfgParsed.success) {
    log.error('campaign.invalid_config', { slug, issues: cfgParsed.error.issues });
    return c.json({ error: 'campaign_misconfigured' }, 500);
  }
  const cfg: EarlyBirdConfig = cfgParsed.data;

  if (campaign.capacity !== null) {
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM campaign_participations WHERE campaign_id = ?`,
    )
      .bind(campaign.id)
      .first<{ n: number }>();
    if ((countRow?.n ?? 0) >= campaign.capacity) {
      return c.json({ code: 'CAMPAIGN_FULL', error: 'campaign_full' }, 409);
    }
  }

  // ===== 已报名幂等返回 =====
  const existing = await c.env.DB.prepare(
    `SELECT joined_at FROM campaign_participations WHERE user_id = ? AND campaign_id = ?`,
  )
    .bind(sessionUser.id, campaign.id)
    .first<{ joined_at: number }>();
  if (existing) {
    return c.json({ ok: true, alreadyJoined: true, joinedAt: existing.joined_at });
  }

  // ===== 计算 perks 参数（统一公式） =====
  // 1) 当前 active subscription current_period_end（status ∈ active/trialing/paused
  //    或 canceled-but-not-expired）
  const subRow = await c.env.DB.prepare(
    `SELECT current_period_end, status FROM subscriptions
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 1`,
  )
    .bind(sessionUser.id)
    .first<{ current_period_end: number; status: string }>();
  const subActiveStatuses = new Set(['active', 'trialing', 'paused']);
  let subEnd = 0;
  if (subRow) {
    const s = subRow.status;
    const isActiveLike = subActiveStatuses.has(s);
    const isCanceledNotExpired = s === 'canceled' && subRow.current_period_end > now;
    if (isActiveLike || isCanceledNotExpired) subEnd = subRow.current_period_end;
  }

  // 2) 当前生效 gift_grants max(expires_at)
  const giftRow = await c.env.DB.prepare(
    `SELECT MAX(expires_at) AS m FROM gift_grants
      WHERE user_id = ? AND status = 'active' AND expires_at > ?`,
  )
    .bind(sessionUser.id, now)
    .first<{ m: number | null }>();
  const giftMaxEnd = giftRow?.m ?? 0;

  // 3) 统一基准
  const grantedAt = Math.max(now, subEnd, giftMaxEnd);
  const giftExpiresAt = grantedAt + cfg.perks.gift_days * MS_PER_DAY;
  // pro_lapses_at 在 user_discounts INSERT 里直接赋初值，绕过
  // lib/user-discounts.ts:extendProLapsesAt() helper —— 因为这里要打包进 D1
  // batch，helper 是单独的 UPDATE 没法和 INSERT 共享原子性。语义等价：行不存
  // 在时，helper 的 MAX(COALESCE(NULL,0), target) 等于直接 INSERT target。
  const proLapsesAt = giftExpiresAt + cfg.perks.discount.grace_period_days * MS_PER_DAY;

  // gift_grants id 用 (userId, 'campaign', campaign.id) 确定性，重试幂等
  const giftId = await computeGrantId(sessionUser.id, 'campaign', campaign.id);

  // ===== Batch 写 3 张表 =====
  const perksJson = JSON.stringify({
    gift_grant_ids: [giftId],
    user_discount_keys: [cfg.perks.discount.code],
  });

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO gift_grants
           (id, user_id, days, granted_at, expires_at, source_kind, source_id, status, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'campaign', ?, 'active', NULL, ?, ?)`,
      ).bind(
        giftId,
        sessionUser.id,
        cfg.perks.gift_days,
        grantedAt,
        giftExpiresAt,
        campaign.id,
        now,
        now,
      ),
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO user_discounts
           (user_id, code, percentage, duration, source_kind, source_id, valid_from, expires_at,
            pro_lapses_at, grace_period_days, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'campaign', ?, ?, NULL, ?, ?, 'active', ?, ?)`,
      ).bind(
        sessionUser.id,
        cfg.perks.discount.code,
        cfg.perks.discount.percentage,
        cfg.perks.discount.duration,
        campaign.id,
        now,
        proLapsesAt,
        cfg.perks.discount.grace_period_days,
        now,
        now,
      ),
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO campaign_participations
           (user_id, campaign_id, joined_at, perks_json, meta_json)
         VALUES (?, ?, ?, ?, NULL)`,
      ).bind(sessionUser.id, campaign.id, now, perksJson),
    ]);
  } catch (err) {
    log.error('campaign.join_batch_failed', { slug, userId: sessionUser.id, err });
    return c.json({ error: 'internal_error' }, 500);
  }

  // batch 成功后显式 invalidate gift_active KV 让 tier 立即反映新 grant
  if (c.env.KV && typeof c.env.KV.delete === 'function') {
    c.env.KV.delete(`${GIFT_ACTIVE_CACHE_PREFIX}${sessionUser.id}`).catch(() => undefined);
  }

  // Phase 2 多 campaign 安全网：batch 里 INSERT OR IGNORE 只给本 campaign 行赋
  // 初始 pro_lapses_at，不会更新用户已有的其他 active user_discounts 行。这里
  // 显式 fan-out 推一次，让所有 active 行（含本次新写的）都被推到 max(原值,
  // giftExpiresAt + grace)。Phase 1 单活动场景下对新写行是恒等操作（MAX(X, X)），
  // 无副作用；Phase 2 时自动正确。
  await extendProLapsesAt(c.env.DB, sessionUser.id, giftExpiresAt).catch((err) => {
    log.warn('campaign.extend_pro_lapses_at_failed', { slug, userId: sessionUser.id, err });
  });

  // emit campaign_join event（容错吞错，不影响响应）
  if (c.env.EVENTS_DISABLED !== '1') {
    try {
      const propsResult = validateEventProps({
        campaign_slug: campaign.slug,
        campaign_type: campaign.type,
      });
      if (propsResult.ok) {
        const tier = await resolveUserTier(c.env.DB, sessionUser.id, c.env.KV);
        const subjectIdHash = await hashSubjectId('user', sessionUser.id);
        writeEventPoint(c.env.EVENTS, {
          eventName: 'campaign_join',
          pagePath: '',
          locale: '',
          tier: tier === 'pro' ? 'pro' : 'free',
          subjectKind: 'user',
          subjectIdHash,
          propsJson: propsResult.json || undefined,
        });
      } else {
        log.warn('events.campaign_join_props_invalid', { reason: propsResult.error });
      }
    } catch (err) {
      log.warn('events.campaign_join_emit_failed', { err });
    }
  }

  return c.json({ ok: true, alreadyJoined: false, joinedAt: now });
});
