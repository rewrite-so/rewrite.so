import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { rewriteRoute } from './routes/rewrite.ts';
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

// Phase 2: /api/auth/*, /v1/me/*
// Phase 4: /v1/billing/*, /webhooks/creem

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('[api error]', err);
  return c.json({ error: 'internal_error' }, 500);
});

export default app;
