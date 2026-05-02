import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAuth } from './lib/auth.ts';
import { billingRoute } from './routes/billing.ts';
import { meRoute } from './routes/me.ts';
import { rewriteRoute } from './routes/rewrite.ts';
import { webhookRoute } from './routes/webhook.ts';
import type { AppEnv } from './types.ts';

const app = new Hono<AppEnv>();

app.use(
  '*',
  cors({
    origin: (origin) => origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'cf-turnstile-token'],
    credentials: true,
    maxAge: 86400,
  }),
);

app.get('/health', (c) => {
  return c.json({ ok: true, service: 'rewrite-api', ts: Date.now() });
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

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('[api error]', err);
  return c.json({ error: 'internal_error' }, 500);
});

export default app;

// Durable Object 类必须从 worker entry 导出，wrangler.toml 才能挂上 binding
export { RateLimiter } from './do/rate-limiter.ts';
