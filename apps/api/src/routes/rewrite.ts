import { buildMessages } from '@rewrite/prompts';
import { MAX_INPUT_CHARS, RewriteRequestSchema, type Style } from '@rewrite/shared';
import { Hono } from 'hono';
import { muxToSSE } from '../lib/sse.ts';
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

  // 服务端目标语言判定：优先用客户端给的 lang；'auto' 兜底为 'en'
  // (客户端已经做过启发式；服务端不重复判定)
  const targetLang = req.lang === 'auto' ? 'en' : req.lang;

  // upstream 配置（无内置默认值，必须由环境变量提供）
  const baseUrl = c.env.OPENAI_BASE_URL;
  const apiKey = c.env.OPENAI_API_KEY;
  const model = c.env.OPENAI_MODEL;
  if (!baseUrl || !apiKey || !model) {
    return c.json({ error: 'upstream_not_configured' }, 503);
  }
  const upstreamConfig = { baseUrl, apiKey, model };

  // AbortSignal: client 断开 → c.req.raw.signal abort → 级联到 3 路 fetch
  const signal = c.req.raw.signal;

  const requestId = crypto.randomUUID();

  const streams = req.styles.map((style) => ({
    style: style as Style,
    iter: streamCompletion(
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
  }));

  const sse = muxToSSE({ streams, requestId, langDetected: targetLang }, signal);

  return new Response(sse, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no', // 禁止任何中间代理缓冲
      connection: 'keep-alive',
    },
  });
});
