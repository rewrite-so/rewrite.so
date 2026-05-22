import { buildMessages } from '@rewrite/prompts';
import {
  MAX_INPUT_CHARS,
  type MetaStatus,
  RewriteRequestSchema,
  type Style,
} from '@rewrite/shared';
import { type Context, Hono } from 'hono';
import { BURST_BUCKETS, consume } from '../do/rate-limiter.ts';
import { decryptApiKey } from '../lib/crypto.ts';
import { isAllowedExtensionOrigin } from '../lib/extension-origin.ts';
import { log } from '../lib/log.ts';
import {
  hashUserId,
  isCustomTargetLang,
  type RequestMetric,
  type RewriteStatus,
  writeRequestEvent,
  writeRewriteRequestLog,
} from '../lib/metrics.ts';
import {
  checkAndIncrement,
  hashIp,
  resolveUserTier,
  type Subject,
  type Tier,
} from '../lib/quota.ts';
import { sanitizeTargetLang } from '../lib/sanitize-target-lang.ts';
import { getOrResolveUserId } from '../lib/session-cache.ts';
import { muxToSSE } from '../lib/sse.ts';
import { stripThinking } from '../lib/strip-thinking.ts';
import { verifyTurnstile } from '../lib/turnstile.ts';
import { streamCompletion, type UpstreamConfig } from '../lib/upstream.ts';
import type { AppEnv } from '../types.ts';

interface ByokConfigRow {
  base_url: string;
  model: string;
  encrypted_api_key: string;
  iv: string;
}

export const rewriteRoute = new Hono<AppEnv>();

function isExtensionRewriteRequest(headers: Headers, env: AppEnv['Bindings']): boolean {
  const origin = headers.get('origin') ?? '';
  // x-rewrite-client header 任何 same-site fetch 都能加（同域 web JS / 第三方网页），
  // 不能作为授权依据。生产只信任 EXTENSION_ALLOWED_ORIGINS 白名单里的 extension origin。
  if (isAllowedExtensionOrigin(origin, env)) return true;

  // 本地/测试环境下 Hono app.request 没有 extension origin；允许 installId 走 dev。
  // 生产环境 BETTER_AUTH_URL 是 https://api.rewrite.so 不会命中这条分支。
  const authUrl = env.BETTER_AUTH_URL ?? '';
  const isLocalApi =
    authUrl.startsWith('http://localhost') || authUrl.startsWith('http://127.0.0.1');
  if (!isLocalApi) return false;
  return !origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
}

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
  // ban-check middleware 已挂在 /v1/rewrite，命中已 401；这里 getOrResolveUserId
  // 直接复用 c.var.sessionUserId，无第二次 better-auth getSession 往返。
  const userId = (await getOrResolveUserId(c)) ?? undefined;

  let subject: Subject;
  let tier: Tier;
  let userTargetLang: string | null = null;
  // DB 里 user_settings.target_lang 的原始值（含 'auto'）。给 SSE meta.status.userTargetLang
  // 透传，扩展端写回 chrome.storage 实现实时同步。userTargetLang 上面那个用于 prompt
  // 注入 —— 'auto' 时为 null 让客户端 lang 兜底
  let userTargetLangRaw: string | null = null;
  let byokConfig: ByokConfigRow | null = null;
  let anonymousIp: string | null = null;
  if (userId) {
    subject = { kind: 'user', id: userId };
    tier = await resolveUserTier(c.env.DB, userId, c.env.KV);
    // 拿账号偏好的 target_lang，登录用户优先用账号设置覆盖客户端 lang
    const prefs = await c.env.DB.prepare('SELECT target_lang FROM user_settings WHERE user_id = ?')
      .bind(userId)
      .first<{ target_lang: string }>();
    if (prefs?.target_lang) {
      const cleaned = sanitizeTargetLang(prefs.target_lang);
      if (cleaned) {
        userTargetLangRaw = cleaned;
        if (cleaned !== 'auto') {
          userTargetLang = cleaned;
        }
      }
    }
    // BYOK 配置（任何登录用户都可配；Pro 差异化是 hosted model 配额与支持）
    byokConfig = await c.env.DB.prepare(
      'SELECT base_url, model, encrypted_api_key, iv FROM byok_keys WHERE user_id = ?',
    )
      .bind(userId)
      .first<ByokConfigRow>();
  } else if (req.installId) {
    if (!isExtensionRewriteRequest(c.req.raw.headers, c.env)) {
      return c.json({ error: 'invalid_client' }, 403);
    }
    subject = { kind: 'install', id: req.installId };
    tier = 'anonymous_install';
  } else {
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      '0.0.0.0';
    anonymousIp = ip;
    const ipHash = await hashIp(ip, c.env.BETTER_AUTH_SECRET);
    subject = { kind: 'ip', id: ipHash };
    tier = 'anonymous_ip';
  }

  if (!userId && !req.installId) {
    const turnstileOk = await verifyTurnstile(
      c.env.TURNSTILE_SECRET,
      req.turnstileToken,
      anonymousIp ?? undefined,
    );
    if (!turnstileOk) {
      return c.json({ error: 'turnstile_failed' }, 403);
    }
  }

  // ===== Burst 限流（DO） =====
  const isBYOK = byokConfig !== null;
  const bucket =
    isBYOK && subject.kind === 'user'
      ? BURST_BUCKETS.byokUser
      : subject.kind === 'user'
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
  // BYOK 用户：不查月配额，仅记 byok_count；DO burst 仍生效作为反代滥用底线
  const quota = await checkAndIncrement(c.env.DB, subject, tier, isBYOK);
  if (!quota.allowed) {
    // 配额耗尽：埋点 status='quota_exceeded'，再返 4xx
    dispatchMetric(
      c,
      buildAndWriteMetric(c.env, {
        tier,
        styles: req.styles,
        targetLangRaw: req.lang,
        inputLength: req.text.length,
        upstream: isBYOK ? 'byok' : 'platform',
        isRegen: req.regen,
        status: 'quota_exceeded',
        userId,
        subjectKind: subject.kind,
        subjectIdRaw: subject.id,
      }),
    );
    // 把 authed/tier 带入 4xx body，让客户端 setGlobalError 决定 CTA：
    // 登录用户 → "Configure BYOK or upgrade"，匿名 → "Sign in for more"
    return c.json(
      {
        error: 'quota_exceeded',
        used: quota.used,
        limit: quota.limit,
        resetAt: quota.resetAt,
        authed: !!userId,
        tier,
      },
      429,
    );
  }

  // ===== 上游配置 =====
  // BYOK 用户用自己的 base_url/key/model；其他用户走平台默认
  let upstreamConfig: UpstreamConfig;
  if (byokConfig) {
    let plainKey: string;
    try {
      plainKey = await decryptApiKey(
        byokConfig.encrypted_api_key,
        byokConfig.iv,
        c.env.BYOK_MASTER_KEY,
      );
    } catch (err) {
      log.error('rewrite.byok_decrypt_failed', { err });
      return c.json({ error: 'byok_decrypt_failed' }, 500);
    }
    upstreamConfig = {
      baseUrl: byokConfig.base_url,
      apiKey: plainKey,
      model: byokConfig.model,
    };
  } else {
    const baseUrl = c.env.OPENAI_BASE_URL;
    const apiKey = c.env.OPENAI_API_KEY;
    const model = c.env.OPENAI_MODEL;
    if (!baseUrl || !apiKey || !model) {
      return c.json({ error: 'upstream_not_configured' }, 503);
    }
    upstreamConfig = {
      baseUrl,
      apiKey,
      model,
      extraBody: { thinking: { type: 'disabled' } },
    };
  }

  // ===== 服务端目标语言判定 =====
  // 优先级: 账号偏好（登录用户）> 客户端 lang > 'en' 兜底
  // 客户端 lang='auto' 表示让服务端决定（取自启发式或账号偏好）
  const requestTargetLang = req.lang === 'auto' ? 'en' : sanitizeTargetLang(req.lang);
  if (!requestTargetLang) {
    return c.json({ error: 'invalid_input', detail: 'lang empty after sanitize' }, 400);
  }
  const targetLang = userTargetLang ?? requestTargetLang;

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

  // 浮窗状态信息：BYOK 模式不带 used/limit（无限），其它都带
  // userTargetLang 仅登录用户带（DB 原始值，含 'auto'）—— 扩展端写回 chrome.storage
  const status: MetaStatus = {
    authed: !!userId,
    tier,
    isBYOK,
    ...(isBYOK ? {} : { used: quota.used, limit: quota.limit }),
    ...(userTargetLangRaw !== null ? { userTargetLang: userTargetLangRaw } : {}),
  };

  // ===== Analytics Engine 埋点 =====
  // 仅写中性维度，零原文 / 输出 / 邮箱 / 完整 IP（隐私铁律）。
  // 字段映射详见 lib/metrics.ts。三个时点：onFirstByte（ms_to_first_byte）/
  // onComplete（status='ok' + ms_total）/ onStreamError + onAbort（异常分支）。
  const tStart = Date.now();
  let firstByteMs: number | undefined;
  let firstStreamErrorCode: string | undefined;

  const emitMetric = (status: RewriteStatus, errorCode?: string) => {
    dispatchMetric(
      c,
      buildAndWriteMetric(c.env, {
        tier,
        styles: req.styles,
        targetLangRaw: req.lang,
        inputLength: req.text.length,
        upstream: isBYOK ? 'byok' : 'platform',
        isRegen: req.regen,
        status,
        errorCode,
        msToFirstByte: firstByteMs,
        msTotal: Date.now() - tStart,
        userId,
        subjectKind: subject.kind,
        subjectIdRaw: subject.id,
      }),
    );
  };

  const sse = muxToSSE(
    {
      streams,
      requestId,
      langDetected: targetLang,
      status,
      lifecycle: {
        onFirstByte: () => {
          firstByteMs = Date.now() - tStart;
        },
        onComplete: () => {
          // 任何 stream 出错过 → status=upstream_error；否则 ok
          emitMetric(firstStreamErrorCode ? 'upstream_error' : 'ok', firstStreamErrorCode);
        },
        onStreamError: (code) => {
          if (!firstStreamErrorCode) firstStreamErrorCode = code;
        },
        onAbort: () => {
          emitMetric('aborted');
        },
      },
    },
    signal,
  );

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

/**
 * c.executionCtx.waitUntil 在真实 Workers runtime 总是可用，但 Hono test
 * `app.request(path, init, env)` 不注入 ExecutionContext，访问会抛错。把
 * waitUntil 调用包一层 try/catch；测试环境下 promise 失败也不冒泡到主响应。
 */
function dispatchMetric(c: Context<AppEnv>, p: Promise<void>): void {
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    // test env or no execution ctx — swallow promise rejections to avoid noise
    p.catch(() => undefined);
  }
}

interface MetricInput {
  tier: Tier;
  /** zod 验证后的 styles，运行时是 'faithful' | 'casual' | 'formal' 之一 */
  styles: readonly string[];
  /** 客户端原始 lang（含 'auto' / 标准 locale / 自定义短语）；构造 metric 时 sanitize */
  targetLangRaw: string;
  inputLength: number;
  upstream: 'platform' | 'byok';
  /** true = 单卡 regenerate 重发；首发 / retry-all 不带 */
  isRegen?: boolean;
  status: RewriteStatus;
  errorCode?: string;
  msToFirstByte?: number;
  msTotal?: number;
  userId: string | undefined;
  subjectKind: Subject['kind'];
  /** 登录用户 = userId；install/ip subject = 已 hash 过的 id（不需要再 hash） */
  subjectIdRaw: string;
}

async function buildAndWriteMetric(env: AppEnv['Bindings'], input: MetricInput): Promise<void> {
  // 构造 user_id_hash：
  // - 登录用户：hashUserId(user_id) → 16 hex
  // - install/ip 匿名：subject.id 已是 hash 形态（hashIp 在前面跑过；installId 是客户端 UUID
  //   不算 PII），直接传入但同样截断 16 字符避免可识别长度
  let subjectId: string | undefined;
  if (input.userId) {
    subjectId = await hashUserId(input.userId);
  } else if (input.subjectKind === 'ip') {
    subjectId = input.subjectIdRaw.slice(0, 16);
  } else if (input.subjectKind === 'install') {
    // installId 是客户端生成的 uuid，不是 PII，但仍 hash 一遍保持 16 hex 一致格式
    subjectId = await hashUserId(input.subjectIdRaw);
  }

  const metric: RequestMetric = {
    tier: input.tier,
    styles: input.styles,
    targetLang: input.targetLangRaw,
    targetLangIsCustom: isCustomTargetLang(input.targetLangRaw),
    inputLength: input.inputLength,
    upstream: input.upstream,
    isRegen: input.isRegen ?? false,
    status: input.status,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(input.msToFirstByte !== undefined ? { msToFirstByte: input.msToFirstByte } : {}),
    ...(input.msTotal !== undefined ? { msTotal: input.msTotal } : {}),
    ...(subjectId ? { subjectId } : {}),
  };

  try {
    writeRequestEvent(env.METRICS, metric);
    // D1 镜像（无采样精确逐实体源）。与 AE 写并列，同 fire-and-forget 契约；
    // writeRewriteRequestLog 内部自吞错误，这里 await 仅为让 waitUntil 等齐。
    await writeRewriteRequestLog(env.DB, metric, Date.now());
  } catch (err) {
    // Analytics Engine / D1 写入失败不能影响主流程；仅留 warning（log.ts 不记原文）
    log.warn('metrics.write_failed', { err: String(err).slice(0, 200) });
  }
}
