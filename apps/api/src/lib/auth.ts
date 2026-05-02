import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import { Resend } from 'resend';
import { authSchema } from '../db/auth-schema.ts';
import { sendWelcomeNow } from '../emails/dispatcher.ts';
import type { Bindings } from '../types.ts';

/**
 * 创建 better-auth 实例。每次请求构造一次（D1Database 在 env 里，不能复用）。
 *
 * 设计：
 * - drizzle 仅给 better-auth 4 张表用（CLAUDE.md 已说明这是"D1 不用 ORM"原则的唯一例外）
 * - 启用 Magic Link（通过 Resend 发送）
 * - Google OAuth 待用户提供 client id/secret 后开启
 * - 生产环境 cookie domain = `.rewrite.so`，主域和 api 子域共享 session cookie
 */
export function createAuth(env: Bindings) {
  const db = drizzle(env.DB, { schema: authSchema });
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

  const trustedOrigins = [
    'http://localhost:3000',
    'http://localhost:8787',
    'https://rewrite.so',
    'https://api.rewrite.so',
  ];

  // 生产环境（api.rewrite.so）下让 cookie domain = .rewrite.so，
  // 这样 api 设的 session cookie 在 web origin (rewrite.so) 也能读到 —
  // 避免依赖 next rewrites 代理 set-cookie（OpenNext 对 GET + 特定 query 的 rewrite 有 bug）。
  const apiUrl = env.BETTER_AUTH_URL || 'http://localhost:8787';
  const isProdRewriteSo = apiUrl.endsWith('rewrite.so') || apiUrl.includes('rewrite.so/');
  const crossSubDomain = isProdRewriteSo
    ? { crossSubDomainCookies: { enabled: true, domain: '.rewrite.so' } }
    : {};

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: authSchema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: apiUrl,
    trustedOrigins,
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: apiUrl.startsWith('https://'),
      },
      ...crossSubDomain,
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          // 邮件链接直指 api origin，让 better-auth 在 api worker 直接处理 verify
          // 并 302 redirect 到 callbackURL (web origin)。cookie domain=.rewrite.so
          // 跨子域共享，所以 redirect 后 web 端也能读到 session。
          if (!resend) {
            // dev fallback: print the URL so devs can click it without a real Resend setup
            console.warn(`[auth] RESEND_API_KEY missing; magic link: ${url}`);
            return;
          }
          const from = env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
          await resend.emails.send({
            from: `rewrite.so <${from}>`,
            to: email,
            subject: 'Sign in to rewrite.so',
            html: renderMagicLinkHtml(url, email),
            text: renderMagicLinkText(url),
          });
        },
        expiresIn: 60 * 15, // 15 minutes
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Best-effort welcome email. If it fails (Resend down, rate limit,
            // etc.), the daily cron will pick up users with welcome_sent_at IS NULL.
            await sendWelcomeNow(env, {
              id: user.id,
              email: user.email,
              name: user.name ?? null,
            });
          },
        },
      },
    },
  });
}

function renderMagicLinkHtml(url: string, email: string): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:32px auto;padding:24px;color:#1f1f22;">
<h2 style="margin:0 0 12px;font-size:18px;font-weight:600">Sign in to rewrite.so</h2>
<p style="color:#555;font-size:14px;line-height:1.55;margin:0 0 20px">
  Click the button below to sign in to <code>${escapeHtml(email)}</code>. The link is valid for 15 minutes.
</p>
<p style="margin:24px 0">
  <a href="${escapeHtml(url)}"
     style="display:inline-block;padding:11px 22px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">
    Sign in to rewrite.so
  </a>
</p>
<p style="color:#999;font-size:12px;line-height:1.5;margin:24px 0 0">
  If the button doesn’t work, paste this link into your browser:<br>
  <span style="word-break:break-all">${escapeHtml(url)}</span>
</p>
<p style="color:#bbb;font-size:11px;margin:16px 0 0">If you didn’t request this, just ignore the email.</p>
</body></html>`;
}

function renderMagicLinkText(url: string): string {
  return `Sign in to rewrite.so: ${url}\n\nLink valid for 15 minutes. If you didn’t request this, ignore the email.`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
