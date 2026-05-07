import { QUOTA } from '@rewrite/shared';

/**
 * 月配额（D1 usage_monthly）：
 * - subject 三维度：'user' | 'install' | 'ip'
 * - 按 UTC 自然月聚合
 * - BYOK 用户跳过（计 byok_count 不计 count）
 *
 * Burst 限流（秒级）见 do/rate-limiter.ts，与本模块逻辑分离。
 */

export type SubjectKind = 'user' | 'install' | 'ip';

export interface Subject {
  kind: SubjectKind;
  id: string;
}

export type Tier = 'anonymous_ip' | 'anonymous_install' | 'free' | 'pro';

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  /** 下个月 UTC 00:00 ISO 字符串 */
  resetAt: string;
}

const TIER_LIMITS: Record<Tier, number> = {
  anonymous_ip: QUOTA.anonymousIp,
  anonymous_install: QUOTA.anonymousInstall,
  free: QUOTA.loggedInFree,
  pro: QUOTA.pro,
};

/**
 * 获取当月已用且未消耗（仅查询）。
 */
export async function getUsage(
  db: D1Database,
  subject: Subject,
  tier: Tier,
): Promise<QuotaCheckResult> {
  const month = currentMonthUtc();
  const row = await db
    .prepare(
      'SELECT count FROM usage_monthly WHERE subject_kind = ? AND subject_id = ? AND month_utc = ?',
    )
    .bind(subject.kind, subject.id, month)
    .first<{ count: number }>();
  const used = row?.count ?? 0;
  const limit = TIER_LIMITS[tier];
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: nextMonthUtcIso(),
  };
}

/**
 * 检查 + 累加月配额。
 * - 非 BYOK：count + 1，超过 limit 时 allowed=false 不写入
 * - BYOK：byok_count + 1，永远 allowed
 */
export async function checkAndIncrement(
  db: D1Database,
  subject: Subject,
  tier: Tier,
  isBYOK: boolean,
): Promise<QuotaCheckResult> {
  const month = currentMonthUtc();
  const now = Date.now();

  if (isBYOK) {
    await upsertUsage(db, subject, month, { count: 0, byokCount: 1 }, now);
    return {
      allowed: true,
      used: 0,
      // BYOK 显示无限（界面用）
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      resetAt: nextMonthUtcIso(),
    };
  }

  // 先读现值用于快速拒绝与 UI 返回；真正消耗用条件 UPDATE 原子完成，
  // 避免并发请求同时看到 count=limit-1 后都放行。
  const before = await db
    .prepare(
      'SELECT count FROM usage_monthly WHERE subject_kind = ? AND subject_id = ? AND month_utc = ?',
    )
    .bind(subject.kind, subject.id, month)
    .first<{ count: number }>();
  const usedBefore = before?.count ?? 0;
  const limit = TIER_LIMITS[tier];

  if (usedBefore >= limit) {
    return {
      allowed: false,
      used: usedBefore,
      limit,
      remaining: 0,
      resetAt: nextMonthUtcIso(),
    };
  }

  await insertUsageRowIfMissing(db, subject, month, now);
  const updateRes = await db
    .prepare(
      `UPDATE usage_monthly
          SET count = count + 1,
              updated_at = ?
        WHERE subject_kind = ?
          AND subject_id = ?
          AND month_utc = ?
          AND count < ?`,
    )
    .bind(now, subject.kind, subject.id, month, limit)
    .run();
  const changes = getD1Changes(updateRes);
  if (changes === 0) {
    const current = await db
      .prepare(
        'SELECT count FROM usage_monthly WHERE subject_kind = ? AND subject_id = ? AND month_utc = ?',
      )
      .bind(subject.kind, subject.id, month)
      .first<{ count: number }>();
    const used = Math.max(usedBefore, current?.count ?? usedBefore);
    return {
      allowed: false,
      used,
      limit,
      remaining: 0,
      resetAt: nextMonthUtcIso(),
    };
  }

  const after = await db
    .prepare(
      'SELECT count FROM usage_monthly WHERE subject_kind = ? AND subject_id = ? AND month_utc = ?',
    )
    .bind(subject.kind, subject.id, month)
    .first<{ count: number }>();
  const used = after?.count ?? usedBefore + 1;
  return {
    allowed: true,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: nextMonthUtcIso(),
  };
}

async function insertUsageRowIfMissing(
  db: D1Database,
  subject: Subject,
  month: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO usage_monthly
         (subject_kind, subject_id, month_utc, count, byok_count, updated_at)
       VALUES (?, ?, ?, 0, 0, ?)`,
    )
    .bind(subject.kind, subject.id, month, now)
    .run();
}

function getD1Changes(result: unknown): number | undefined {
  const meta = (result as { meta?: { changes?: unknown } } | null)?.meta;
  return typeof meta?.changes === 'number' ? meta.changes : undefined;
}

async function upsertUsage(
  db: D1Database,
  subject: Subject,
  month: string,
  delta: { count: number; byokCount: number },
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO usage_monthly (subject_kind, subject_id, month_utc, count, byok_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (subject_kind, subject_id, month_utc) DO UPDATE SET
         count = count + excluded.count,
         byok_count = byok_count + excluded.byok_count,
         updated_at = excluded.updated_at`,
    )
    .bind(subject.kind, subject.id, month, delta.count, delta.byokCount, now)
    .run();
}

/** KV 缓存层：admin_user_overrides 命中 / 缺失（sentinel）的 5min TTL，避免热路径双 D1 SELECT。 */
const OVERRIDE_CACHE_PREFIX = 'override:';
const OVERRIDE_CACHE_TTL_SEC = 300;
const OVERRIDE_NONE_SENTINEL = '__none__';

interface OverrideRow {
  force_tier: 'pro' | 'free';
  expires_at: number | null;
}

/**
 * 查 admin_user_overrides 缓存。命中 sentinel 返 null（无 override），
 * 命中真实行返 row，未命中返 undefined（caller 走 D1）。
 */
async function readOverrideCache(
  kv: KVNamespace | undefined,
  userId: string,
): Promise<OverrideRow | null | undefined> {
  if (!kv || typeof kv.get !== 'function') return undefined;
  let cached: string | null;
  try {
    cached = await kv.get(`${OVERRIDE_CACHE_PREFIX}${userId}`);
  } catch {
    // KV outage / serialization error → treat as cache miss, fall through to D1
    return undefined;
  }
  if (cached === null) return undefined;
  if (cached === OVERRIDE_NONE_SENTINEL) return null;
  try {
    return JSON.parse(cached) as OverrideRow;
  } catch {
    return undefined;
  }
}

async function writeOverrideCache(
  kv: KVNamespace | undefined,
  userId: string,
  value: OverrideRow | null,
): Promise<void> {
  if (!kv || typeof kv.put !== 'function') return;
  const body = value === null ? OVERRIDE_NONE_SENTINEL : JSON.stringify(value);
  try {
    await kv.put(`${OVERRIDE_CACHE_PREFIX}${userId}`, body, {
      expirationTtl: OVERRIDE_CACHE_TTL_SEC,
    });
  } catch {
    // best-effort cache write
  }
}

/**
 * 根据 admin_user_overrides + subscriptions 表决定登录用户的 tier。
 *
 * 优先级（高 → 低）：
 * 1. admin_user_overrides 中存在且未过期的 force_tier — 运营手术性调档
 * 2. subscriptions 状态：
 *    - 'active' / 'trialing' / 'paused' → 'pro'
 *    - 'canceled' 且 current_period_end > now → 'pro'（已付到周期末）
 *    - 否则 → 'free'（含 expired / past_due / 未订阅）
 *
 * KV 缓存（仅当 kv 传入时）：admin_user_overrides 行数极少且写入低频；
 * miss 后写 5min TTL；NULL 也缓存 sentinel 防穿透。admin worker 写表后
 * KV.delete('override:'+user_id) 立即失效。
 */
export async function resolveUserTier(
  db: D1Database,
  userId: string,
  kv?: KVNamespace,
): Promise<Tier> {
  const now = Date.now();

  // ===== Step 1: admin override 优先 =====
  let override = await readOverrideCache(kv, userId);
  if (override === undefined) {
    const row = await db
      .prepare(
        `SELECT force_tier, expires_at FROM admin_user_overrides WHERE user_id = ? LIMIT 1`,
      )
      .bind(userId)
      .first<{ force_tier: string; expires_at: number | null }>();
    if (row && (row.force_tier === 'pro' || row.force_tier === 'free')) {
      override = { force_tier: row.force_tier, expires_at: row.expires_at };
    } else {
      override = null;
    }
    // 不阻塞主路径：缓存写失败也无所谓
    await writeOverrideCache(kv, userId, override).catch(() => undefined);
  }
  if (override) {
    const expiresMs = override.expires_at == null ? null : override.expires_at * 1000;
    if (expiresMs == null || expiresMs > now) {
      return override.force_tier;
    }
    // 已过期：fall through 到 subscriptions 查询。不主动清缓存（TTL 自然过期），
    // 时间判断在每次 read 都跑一遍，不会误返已过期的 override。
  }

  // ===== Step 2: subscriptions =====
  const row = await db
    .prepare(
      `SELECT status, current_period_end FROM subscriptions
         WHERE user_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
    )
    .bind(userId)
    .first<{ status: string; current_period_end: number }>();
  if (!row) return 'free';
  const s = row.status;
  if (s === 'active' || s === 'trialing' || s === 'paused') return 'pro';
  if (s === 'canceled' && row.current_period_end > now) return 'pro';
  return 'free';
}

export interface ClaimResult {
  /** 本次实际合并掉的 count（已 claim 过则为 0） */
  merged: number;
  /** 是否触发了实际写入（false = 已 claim 过 / source 行不存在） */
  applied: boolean;
}

/**
 * 把匿名 source（'install' 维度）当月配额合并到登录用户名下。
 * 幂等：靠 usage_claims 表 PK 防重放，第二次调用 merged=0 / applied=false。
 *
 * 设计选择：
 * - 只把 source.count 加到 user.count，**不删 source 行** —— 留作审计；如果用户登出
 *   再用同一 installId 也仍按 install 配额走（已扣的次数不会再扣给 user）
 * - 跨月不需要重 claim，next month 双方都从 0 起
 */
export async function claimAnonymousUsage(
  db: D1Database,
  userId: string,
  source: { kind: 'install'; id: string },
): Promise<ClaimResult> {
  const month = currentMonthUtc();
  const now = Date.now();

  // 1) 拿 source 行的 count
  const sourceRow = await db
    .prepare(
      'SELECT count FROM usage_monthly WHERE subject_kind = ? AND subject_id = ? AND month_utc = ?',
    )
    .bind(source.kind, source.id, month)
    .first<{ count: number }>();
  const sourceCount = sourceRow?.count ?? 0;

  // 2) 写 usage_claims 防重放（INSERT OR IGNORE）
  // changes 仅在该 (user, source_kind, source_id, month) 第一次触发时为 1
  const insertRes = await db
    .prepare(
      `INSERT OR IGNORE INTO usage_claims (user_id, source_kind, source_id, month_utc, merged_count, claimed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(userId, source.kind, source.id, month, sourceCount, now)
    .run();

  const meta = (insertRes.meta ?? {}) as { changes?: number };
  if ((meta.changes ?? 0) === 0) {
    return { merged: 0, applied: false };
  }
  if (sourceCount === 0) {
    return { merged: 0, applied: true };
  }

  // 3) 把 sourceCount 加到 user 维度的 count 上（UPSERT）
  await db
    .prepare(
      `INSERT INTO usage_monthly (subject_kind, subject_id, month_utc, count, byok_count, updated_at)
       VALUES ('user', ?, ?, ?, 0, ?)
       ON CONFLICT (subject_kind, subject_id, month_utc) DO UPDATE SET
         count = count + excluded.count,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, month, sourceCount, now)
    .run();

  return { merged: sourceCount, applied: true };
}

/** 返回 'YYYY-MM' (UTC)。 */
export function currentMonthUtc(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** 下个月 UTC 1 号 00:00 的 ISO 字符串。 */
export function nextMonthUtcIso(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  // m 是 0-based，下个月 = (m+1) % 12，跨年时 y+1
  const nextY = m === 11 ? y + 1 : y;
  const nextM = (m + 1) % 12;
  return new Date(Date.UTC(nextY, nextM, 1)).toISOString();
}

/**
 * 把 IP 地址 hash 成 ip_hash（每日轮换 salt，避免 IP 跨天关联，CLAUDE.md 契约）。
 *
 * 注意：salt 用每日 UTC 日期，所以"今天的 IP X"和"明天的 IP X"对应不同的 ip_hash。
 * 这意味着月配额按 IP 算时，跨日的同 IP 用户会有"今天 10 次明天 10 次"的实际效果——
 * 这是设计权衡：月配额 + 日轮换 salt 在隐私和反滥用之间取平衡。匿名档配额已经低
 * （网页 10/月、扩展 5/月），允许这点宽松。
 */
export async function hashIp(ip: string, secret: string, d: Date = new Date()): Promise<string> {
  const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const data = new TextEncoder().encode(`${ip}|${day}|${secret}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(buf).slice(0, 32);
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i] ?? 0;
    s += v.toString(16).padStart(2, '0');
  }
  return s;
}
