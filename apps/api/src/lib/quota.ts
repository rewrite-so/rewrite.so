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

  // 用 D1 batch 在一次往返中：① 读现值 ② UPSERT 累加
  // SQLite 的 RETURNING * 在 UPSERT 上 D1 支持有限，所以分两步
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

  await upsertUsage(db, subject, month, { count: 1, byokCount: 0 }, now);
  const used = usedBefore + 1;
  return {
    allowed: true,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: nextMonthUtcIso(),
  };
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
