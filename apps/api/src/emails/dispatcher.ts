/**
 * Email dispatcher — scheduled by Cloudflare Cron Triggers (see wrangler.toml).
 *
 * Runs once a day. For each onboarding stage (welcome / D1 / D7 / D14 / D30):
 * 1) SELECT users where stage hasn't been sent and stage's age threshold has been crossed.
 * 2) Send via Resend.
 * 3) UPDATE user_email_state with sent_at = now.
 *
 * Idempotency: a single user_email_state row per user, one column per stage.
 *   We never re-send if the column is non-NULL.
 *
 * Welcome email is also sent eagerly on signup (see better-auth hook in
 * lib/auth.ts) — this cron is the safety net for any signups whose hook
 * failed.
 *
 * i18n: SELECT joins user_settings to read ui_locale; 'auto' or NULL → 'en'.
 *   Each template is locale-aware (see emails/templates.ts).
 */

import { DEFAULT_EXTENSION_INSTALL_URL, LOCALES, type Locale } from '@rewrite/shared';
import { Resend } from 'resend';
import { log } from '../lib/log.ts';
import type { Bindings } from '../types.ts';
import {
  day1Email,
  day7Email,
  day14Email,
  day30Email,
  type EmailRecipient,
  type EmailTemplate,
  type TemplateContext,
  welcomeEmail,
} from './templates.ts';
import { makeUnsubscribeToken } from './unsubscribe.ts';

interface Stage {
  /** Min user age in milliseconds before this stage fires. */
  minAgeMs: number;
  /** Column on user_email_state that gets stamped after a successful send. */
  column: 'welcome_sent_at' | 'd1_sent_at' | 'd7_sent_at' | 'd14_sent_at' | 'd30_sent_at';
  /** Template builder. Receives the user's resolved UI locale. */
  build: (r: EmailRecipient, ctx: TemplateContext, locale: Locale) => EmailTemplate;
  label: string;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const STAGES: Stage[] = [
  // welcome: anyone created > 1 minute ago who hasn't been welcomed (covers
  // signup-hook failures; the hook itself is the primary path).
  {
    minAgeMs: 60_000,
    column: 'welcome_sent_at',
    build: welcomeEmail,
    label: 'welcome',
  },
  { minAgeMs: 1 * DAY, column: 'd1_sent_at', build: day1Email, label: 'd1' },
  { minAgeMs: 7 * DAY, column: 'd7_sent_at', build: day7Email, label: 'd7' },
  { minAgeMs: 14 * DAY, column: 'd14_sent_at', build: day14Email, label: 'd14' },
  { minAgeMs: 30 * DAY, column: 'd30_sent_at', build: day30Email, label: 'd30' },
];

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  ui_locale: string | null;
}

function resolveEmailLocale(stored: string | null | undefined): Locale {
  if (!stored || stored === 'auto') return 'en';
  return (LOCALES as readonly string[]).includes(stored) ? (stored as Locale) : 'en';
}

/**
 * Process all stages. Called by:
 * - Cron Trigger (daily) — scoped: undefined.
 * - Tests / manual ops — limit users via where filter (not implemented).
 */
export async function processOnboardingEmails(env: Bindings): Promise<{ sent: number }> {
  if (!env.RESEND_API_KEY) {
    log.warn('email.dispatcher_skip', { reason: 'no_resend_key' });
    return { sent: 0 };
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const now = Date.now();
  const ctx: TemplateContext = {
    webOrigin: env.WEB_ORIGIN || 'https://rewrite.so',
    extensionInstallUrl: env.EXTENSION_INSTALL_URL || DEFAULT_EXTENSION_INSTALL_URL,
  };
  const fromAddr = env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const from = `rewrite.so <${fromAddr}>`;

  let sent = 0;
  for (const stage of STAGES) {
    sent += await processStage(env.DB, resend, env.BETTER_AUTH_SECRET, from, ctx, stage, now);
  }
  log.info('email.dispatcher_done', { sent });
  return { sent };
}

async function processStage(
  db: D1Database,
  resend: Resend,
  secret: string,
  from: string,
  ctx: TemplateContext,
  stage: Stage,
  now: number,
): Promise<number> {
  const cutoff = now - stage.minAgeMs;

  // Find users old enough whose row in user_email_state either doesn't exist
  // or has NULL for this stage's column. LEFT JOIN handles both cases.
  // unsubscribed_at IS NOT NULL → skip (per CAN-SPAM, unsubscribe stops
  // marketing immediately). user_settings 也 LEFT JOIN 取 ui_locale，没行
  // 时 us.ui_locale 为 NULL，由 resolveEmailLocale 兜底 'en'。
  const rows = await db
    .prepare(
      `SELECT u.id, u.email, u.name, us.ui_locale
         FROM users u
         LEFT JOIN user_email_state s  ON s.user_id  = u.id
         LEFT JOIN user_settings    us ON us.user_id = u.id
        WHERE u.created_at <= ?
          AND (s.${stage.column} IS NULL)
          AND (s.unsubscribed_at IS NULL)
        LIMIT 200`,
    )
    .bind(cutoff)
    .all<UserRow>();

  if (!rows.results || rows.results.length === 0) return 0;

  let sent = 0;
  for (const u of rows.results) {
    try {
      const token = await makeUnsubscribeToken(u.id, secret);
      const locale = resolveEmailLocale(u.ui_locale);
      const tpl = stage.build(
        { email: u.email, name: u.name, userId: u.id, unsubscribeToken: token },
        ctx,
        locale,
      );
      await resend.emails.send({
        from,
        to: u.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        // CAN-SPAM List-Unsubscribe header for one-click unsubscribe in Gmail/Apple Mail
        headers: {
          'List-Unsubscribe': `<${ctx.webOrigin}/unsubscribe?user=${u.id}&token=${token}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      // upsert state
      await db
        .prepare(
          `INSERT INTO user_email_state (user_id, ${stage.column}, created_at, updated_at)
             VALUES (?, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             ${stage.column} = excluded.${stage.column},
             updated_at = excluded.updated_at`,
        )
        .bind(u.id, now, now, now)
        .run();
      sent++;
      log.info('email.sent', { stage: stage.label, userId: u.id, locale });
    } catch (err) {
      log.error('email.send_failed', { stage: stage.label, userId: u.id, err });
      // continue with next user — one failure shouldn't block the queue.
    }
  }
  return sent;
}

/**
 * Eagerly send the welcome email — called from the better-auth signup hook.
 * Best-effort: if it fails, the daily cron will pick it up.
 *
 * 注册 hook 紧跟 INSERT user_settings，所以这里可以 SELECT 查 ui_locale；
 * 缺行兜底 'en'（不会发生但防御性写）。
 */
export async function sendWelcomeNow(
  env: Bindings,
  user: { id: string; email: string; name: string | null },
): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const resend = new Resend(env.RESEND_API_KEY);
  const ctx: TemplateContext = {
    webOrigin: env.WEB_ORIGIN || 'https://rewrite.so',
    extensionInstallUrl: env.EXTENSION_INSTALL_URL || DEFAULT_EXTENSION_INSTALL_URL,
  };
  const fromAddr = env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const from = `rewrite.so <${fromAddr}>`;
  try {
    const settingsRow = await env.DB.prepare(
      'SELECT ui_locale FROM user_settings WHERE user_id = ?',
    )
      .bind(user.id)
      .first<{ ui_locale: string | null }>();
    const locale = resolveEmailLocale(settingsRow?.ui_locale ?? null);

    const token = await makeUnsubscribeToken(user.id, env.BETTER_AUTH_SECRET);
    const tpl = welcomeEmail(
      { email: user.email, name: user.name, userId: user.id, unsubscribeToken: token },
      ctx,
      locale,
    );
    await resend.emails.send({
      from,
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      headers: {
        'List-Unsubscribe': `<${ctx.webOrigin}/unsubscribe?user=${user.id}&token=${token}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO user_email_state (user_id, welcome_sent_at, created_at, updated_at)
         VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         welcome_sent_at = excluded.welcome_sent_at,
         updated_at = excluded.updated_at`,
    )
      .bind(user.id, now, now, now)
      .run();
    log.info('email.sent', { stage: 'welcome', userId: user.id, eager: true, locale });
  } catch (err) {
    log.warn('email.welcome_eager_failed', { userId: user.id, err });
    // safety net: daily cron will retry.
  }
}
