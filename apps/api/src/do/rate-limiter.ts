/**
 * Durable Object: token bucket 秒级 burst 限流。
 *
 * 与月配额（D1 usage_monthly）逻辑分离：
 * - 月配额：业务规则（10/5/30/2000）；超限给"配额用完"提示
 * - Burst 限流（本 DO）：反滥用（防爆刷）；超限给"请求过快"提示
 *
 * DO 实例命名（CLAUDE.md 已记录）：
 * - ip:<sha256(ip+daily_salt)> 防 IP cardinality 爆炸（每日轮换）
 * - install:<installId>
 * - user:<userId>
 *
 * 实现要点：
 * - 惰性补充（每次 consume 按经过时间补，不用 alarm）
 * - debounced 落盘（1 秒内最多 1 次 storage.put）
 * - DO 重启最多丢 1s 状态（对反滥用可接受）
 */

interface State {
  tokens: number;
  lastRefillMs: number;
  capacity: number;
  refillPerSec: number;
}

interface ConsumeRequest {
  cost: number;
  capacity: number;
  refillPerSec: number;
}

interface ConsumeResponse {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimiter implements DurableObject {
  private tokens = 0;
  private lastRefillMs = 0;
  private capacity = 0;
  private refillPerSec = 0;
  private initialized = false;
  private persistTimer: number | null = null;

  constructor(private state: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/consume') {
      return new Response('not found', { status: 404 });
    }

    if (!this.initialized) {
      const stored = await this.state.storage.get<State>('s');
      if (stored) {
        this.tokens = stored.tokens;
        this.lastRefillMs = stored.lastRefillMs;
        this.capacity = stored.capacity;
        this.refillPerSec = stored.refillPerSec;
      }
      this.initialized = true;
    }

    const body = (await req.json()) as ConsumeRequest;
    // 配置每次随请求带，便于无停机调整速率
    this.capacity = body.capacity;
    this.refillPerSec = body.refillPerSec;

    const now = Date.now();
    if (this.lastRefillMs === 0) {
      this.tokens = this.capacity;
      this.lastRefillMs = now;
    } else {
      const elapsedSec = (now - this.lastRefillMs) / 1000;
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
      this.lastRefillMs = now;
    }

    const cost = body.cost;
    let result: ConsumeResponse;
    if (this.tokens >= cost) {
      this.tokens -= cost;
      result = { allowed: true, remaining: this.tokens, retryAfterMs: 0 };
    } else {
      result = {
        allowed: false,
        remaining: this.tokens,
        retryAfterMs: Math.ceil(((cost - this.tokens) / this.refillPerSec) * 1000),
      };
    }

    this.persistDebounced();

    return Response.json(result, { status: result.allowed ? 200 : 429 });
  }

  private persistDebounced(): void {
    if (this.persistTimer !== null) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.state.storage.put<State>('s', {
        tokens: this.tokens,
        lastRefillMs: this.lastRefillMs,
        capacity: this.capacity,
        refillPerSec: this.refillPerSec,
      });
    }, 1000) as unknown as number;
  }
}

// =====================================================================
// 调用方便捷封装
// =====================================================================

import type { Subject } from '../lib/quota.ts';

/** Bucket 配置（CLAUDE.md 已记录推荐值）。 */
export const BURST_BUCKETS = {
  ip: { capacity: 20, refillPerSec: 20 / 60 }, // 20 req/min
  install: { capacity: 15, refillPerSec: 15 / 10 }, // 15/10s
  user: { capacity: 8, refillPerSec: 8 / 30 }, // 8/30s
  // BYOK 用户专用反代滥用底线：100 req/min（CLAUDE.md 契约）
  byokUser: { capacity: 100, refillPerSec: 100 / 60 },
  // BYOK Test endpoint：10 req/min/user。比生产严格——配置态不该频繁打。
  // 防止登录用户用我们 worker 的 IP 做 SSRF / DDoS amplification。
  byokTest: { capacity: 10, refillPerSec: 10 / 60 },
  // claim-install：5 req/min/user。每用户每月只该调一两次（首次登录 + 跨月），
  // 限严是为了防止用户脚本用随机 installId 刷 usage_claims 表灌脏数据。
  claimInstall: { capacity: 5, refillPerSec: 5 / 60 },
} as const;

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export async function consume(
  ns: DurableObjectNamespace,
  subject: Subject,
  bucket: { capacity: number; refillPerSec: number },
): Promise<ConsumeResult> {
  const id = ns.idFromName(`${subject.kind}:${subject.id}`);
  const stub = ns.get(id);
  const res = await stub.fetch('http://do/consume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cost: 1, capacity: bucket.capacity, refillPerSec: bucket.refillPerSec }),
  });
  return (await res.json()) as ConsumeResult;
}
