import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { reconcileSubscriptions } from './cron/reconcile.ts';
import { processOnboardingEmails } from './emails/dispatcher.ts';
import { createAuth } from './lib/auth.ts';
import { log } from './lib/log.ts';
import { billingRoute } from './routes/billing.ts';
import { meRoute } from './routes/me.ts';
import { rewriteRoute } from './routes/rewrite.ts';
import { unsubscribeRoute } from './routes/unsubscribe.ts';
import { webhookRoute } from './routes/webhook.ts';
import type { AppEnv, Bindings } from './types.ts';

const app = new Hono<AppEnv>();

const TRUSTED_CORS_ORIGINS = new Set([
  'https://rewrite.so',
  'https://www.rewrite.so',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function resolveCorsOrigin(origin: string | undefined, env: Bindings): string | undefined {
  if (!origin) return undefined;
  if (env.WEB_ORIGIN && origin === env.WEB_ORIGIN) return origin;
  if (TRUSTED_CORS_ORIGINS.has(origin)) return origin;
  if (origin.startsWith('chrome-extension://')) return origin;
  return undefined;
}

app.use(
  '*',
  cors({
    origin: (origin, c) => resolveCorsOrigin(origin, c.env),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'cf-turnstile-token', 'x-rewrite-client'],
    credentials: true,
    maxAge: 86400,
  }),
);

app.get('/health', (c) => {
  return c.json({ ok: true, service: 'rewrite-api', ts: Date.now() });
});

/**
 * 深度健康检查 — 探活 D1 / KV / DO 是否可达。
 * 不返回敏感信息。任意人都可以打这个端点（用于外部 uptime 监控）。
 */
app.get('/health/deep', async (c) => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};
  const start = (label: string) => {
    const t0 = Date.now();
    return (ok: boolean, error?: string) => {
      checks[label] = { ok, latencyMs: Date.now() - t0, ...(error ? { error } : {}) };
    };
  };

  // D1: SELECT 1
  const dbDone = start('d1');
  try {
    await c.env.DB.prepare('SELECT 1 as ok').first();
    dbDone(true);
  } catch (err) {
    dbDone(false, (err as Error).message.slice(0, 80));
  }

  // KV: read a probe key (returns null is fine)
  const kvDone = start('kv');
  try {
    await c.env.KV.get('__health__');
    kvDone(true);
  } catch (err) {
    kvDone(false, (err as Error).message.slice(0, 80));
  }

  // DO: get a stub by name (doesn't actually call into the object)
  const doDone = start('do');
  try {
    const id = c.env.RATE_LIMITER.idFromName('__health__');
    c.env.RATE_LIMITER.get(id);
    doDone(true);
  } catch (err) {
    doDone(false, (err as Error).message.slice(0, 80));
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return c.json({ ok: allOk, ts: Date.now(), checks }, allOk ? 200 : 503);
});

// Phase 1: POST /v1/rewrite (SSE)
app.route('/', rewriteRoute);
// Phase 2: GET /v1/me, /v1/me/usage, /v1/me/settings
app.route('/', meRoute);

// Phase 2: better-auth handler 全部 /api/auth/* 路由
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// Phase 4: 订阅 + Webhook
app.route('/', billingRoute);
app.route('/', webhookRoute);
// Phase 5: onboarding email unsubscribe
app.route('/', unsubscribeRoute);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  // 不 log request body（保持隐私契约）。仅 log 路径 + method + 错误类型 + message。
  log.error('unhandled', {
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    err,
  });
  return c.json({ error: 'internal_error' }, 500);
});

// 单独 export app 给测试用（Hono `.request(path, init, env)` helper）
export { app };

// Cloudflare Workers 模块格式：导出对象包含 fetch + scheduled 处理器
export default {
  fetch: app.fetch,
  /**
   * Cron Trigger handler — 由 wrangler.toml [triggers] crons 调度。
   * 每天 09:00 UTC 跑一次：
   * - onboarding 邮件 dispatcher（welcome / D1 / D7 / D14 / D30；按 email_state 表幂等）
   * - 订阅 reconcile（webhook miss 兜底；按 creem_subscription_id 幂等）
   *
   * 两个任务并行（waitUntil 各自独立），失败不抛——夜里没人值守，CF 重试可能会
   * 把已经成功的部分再跑一遍，幂等性必须各自保证。
   */
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      processOnboardingEmails(env).catch((err) => {
        log.error('cron.email_dispatch_error', { cron: event.cron, err });
      }),
    );
    ctx.waitUntil(
      reconcileSubscriptions(env).catch((err) => {
        log.error('cron.reconcile_error', { cron: event.cron, err });
      }),
    );
  },
};

// Durable Object 类必须从 worker entry 导出，wrangler.toml 才能挂上 binding
export { RateLimiter } from './do/rate-limiter.ts';
