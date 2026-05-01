import { buildMessages } from '@rewrite/prompts';
import { MAX_INPUT_CHARS, RewriteRequestSchema, type Style } from '@rewrite/shared';
import { Hono } from 'hono';
import { BURST_BUCKETS, consume } from '../do/rate-limiter.ts';
import { createAuth } from '../lib/auth.ts';
import { checkAndIncrement, hashIp, type Subject, type Tier } from '../lib/quota.ts';
import { muxToSSE } from '../lib/sse.ts';
import { stripThinking } from '../lib/strip-thinking.ts';
import { streamCompletion } from '../lib/upstream.ts';
import type { AppEnv } from '../types.ts';

export const rewriteRoute = new Hono<AppEnv>();

rewriteRoute.post('/v1/rewrite', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const parsed = RewriteRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path.includes('text') && issue.code === 'too_big') {
      return c.json({ error: 'input_too_long', limit: MAX_INPUT_CHARS }, 413);
    }
    return c.json({ error: 'invalid_input', detail: issue?.message }, 400);
  }
  const req = parsed.data;

  // ===== Subject 选择 =====
  // 优先级: 登录用户 (user) > 扩展未登录 (install) > 匿名 IP (ip)
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const userId = session?.user.id;

  let subject: Subject;
  let tier: Tier;
  if (userId) {
    subject = { kind: 'user', id: userId };
    // Phase 4 后这里要查 subscriptions 决定 free / pro。MVP 起步先全 free。
    tier = 'free';
  } else if (req.installId) {
    subject = { kind: 'install', id: req.installId };
    tier = 'anonymous_install';
  } else {
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      '0.0.0.0';
    const ipHash = await hashIp(ip, c.env.BETTER_AUTH_SECRET);
    subject = { kind: 'ip', id: ipHash };
    tier = 'anonymous_ip';
  }

  // ===== Burst 限流（DO） =====
  const bucket =
    subject.kind === 'user'
      ? BURST_BUCKETS.user
      : subject.kind === 'install'
        ? BURST_BUCKETS.install
        : BURST_BUCKETS.ip;
  const burst = await consume(c.env.RATE_LIMITER, subject, bucket);
  if (!burst.allowed) {
    return c.json({ error: 'rate_limit', retryAfterMs: burst.retryAfterMs }, 429, {
      'retry-after': String(Math.ceil(burst.retryAfterMs / 1000)),
    });
  }

  // ===== 月配额（D1 usage_monthly） =====
  // BYOK 在 Phase 4 接入；MVP 全 isBYOK=false
  const quota = await checkAndIncrement(c.env.DB, subject, tier, false);
  if (!quota.allowed) {
    return c.json(
      {
        error: 'quota_exceeded',
        used: quota.used,
        limit: quota.limit,
        resetAt: quota.resetAt,
      },
      429,
    );
  }

  // ===== 上游配置 =====
  const baseUrl = c.env.OPENAI_BASE_URL;
  const apiKey = c.env.OPENAI_API_KEY;
  const model = c.env.OPENAI_MODEL;
  if (!baseUrl || !apiKey || !model) {
    return c.json({ error: 'upstream_not_configured' }, 503);
  }
  const upstreamConfig = { baseUrl, apiKey, model };

  // ===== 服务端目标语言判定：优先客户端给的 lang；'auto' 兜底为 'en' =====
  const targetLang = req.lang === 'auto' ? 'en' : req.lang;

  // AbortSignal: client 断开 → c.req.raw.signal abort → 级联到 3 路 fetch
  const signal = c.req.raw.signal;
  const requestId = crypto.randomUUID();

  const streams = req.styles.map((style) => ({
    style: style as Style,
    iter: stripThinking(
      streamCompletion(
        upstreamConfig,
        buildMessages({
          style: style as Style,
          targetLang,
          text: req.text,
          hasSelection: req.hasSelection,
          ...(req.context ? { context: req.context } : {}),
        }),
        signal,
      ),
    ),
  }));

  const sse = muxToSSE({ streams, requestId, langDetected: targetLang }, signal);

  return new Response(sse, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
      'x-rs-quota-remaining': String(quota.remaining),
      'x-rs-quota-limit': String(quota.limit),
    },
  });
});
