/**
 * Onboarding email templates.
 *
 * Each template is a pure function (env, recipient) → { subject, html, text }.
 * No DB / network calls inside. Caller is responsible for recording the send
 * + idempotency. This makes templates trivially testable.
 *
 * Style:
 * - Plain HTML, no images, no tracking pixels (privacy contract).
 * - Plain-text fallback always present (deliverability).
 * - Every email contains an Unsubscribe link (CAN-SPAM).
 */

export interface EmailRecipient {
  email: string;
  name?: string | null;
  userId: string;
  /** Token for one-click unsubscribe (HMAC of userId, see emails/unsubscribe.ts) */
  unsubscribeToken: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateContext {
  webOrigin: string;
}

const greeting = (name?: string | null) => (name ? `Hi ${escapeHtml(name)},` : 'Hi there,');

export function welcomeEmail(r: EmailRecipient, ctx: TemplateContext): EmailTemplate {
  const tryUrl = `${ctx.webOrigin}/try`;
  const unsubUrl = unsubscribeUrl(ctx, r);
  return {
    subject: 'Welcome to rewrite.so — try your first rewrite in 30 seconds',
    html: shell(
      `<p>${greeting(r.name)}</p>
<p>Welcome to <strong>rewrite.so</strong>. Quick reminder of how it works:</p>
<ol>
  <li>Focus any input box on a webpage.</li>
  <li>Tap <kbd>Shift</kbd> twice (within 500 ms).</li>
  <li>Pick the rewrite you like with <kbd>1</kbd>, <kbd>2</kbd>, or <kbd>3</kbd>.</li>
</ol>
<p>If you want to play with it right now without installing anything, hit the demo:</p>
<p><a href="${escapeHtml(tryUrl)}" class="btn">Try it now →</a></p>
<p style="color:#888;font-size:13px">No need to reply — this is a one-time welcome from a real human (me, Lin), but support emails go to hello@rewrite.so.</p>`,
      unsubUrl,
    ),
    text: `${greeting(r.name).replace(/[<>]/g, '')}

Welcome to rewrite.so. Here's how it works:

1. Focus any input on a webpage.
2. Tap Shift twice within 500 ms.
3. Pick a rewrite with 1, 2, or 3.

Try it now: ${tryUrl}

— Lin

Unsubscribe from onboarding emails: ${unsubUrl}`,
  };
}

export function day1Email(r: EmailRecipient, ctx: TemplateContext): EmailTemplate {
  const extUrl = 'https://chrome.google.com/webstore/'; // updated when listed
  const unsubUrl = unsubscribeUrl(ctx, r);
  return {
    subject: 'rewrite.so works on every site once you install the extension',
    html: shell(
      `<p>${greeting(r.name)}</p>
<p>Yesterday you signed up for rewrite.so. The /try demo is fun, but the real magic happens once you install the Chrome extension — then it works in <em>any</em> input box on <em>any</em> site.</p>
<p>Twitter drafts, GitHub PR descriptions, Slack messages, Notion pages, Gmail (compose works in some clients) — all the same Shift-Shift trigger.</p>
<p><a href="${escapeHtml(extUrl)}" class="btn">Install the extension →</a></p>
<p style="color:#888;font-size:13px">Already installed? Ignore this. We won't ping you about it again.</p>`,
      unsubUrl,
    ),
    text: `${greeting(r.name).replace(/[<>]/g, '')}

Yesterday you signed up. The /try demo works, but the extension is where it's at — every input box on every site, same Shift-Shift trigger.

Install: ${extUrl}

Unsubscribe: ${unsubUrl}`,
  };
}

export function day7Email(r: EmailRecipient, ctx: TemplateContext): EmailTemplate {
  const billingUrl = `${ctx.webOrigin}/billing`;
  const docsUrl = `${ctx.webOrigin}/pricing#faq`;
  const unsubUrl = unsubscribeUrl(ctx, r);
  return {
    subject: 'BYOK: bring your own API key for unlimited rewrites',
    html: shell(
      `<p>${greeting(r.name)}</p>
<p>One week in. If you've been hitting the monthly quota, here's the path that scales: <strong>BYOK</strong> (Bring Your Own Key).</p>
<p>You plug in your own OpenAI-compatible API key (OpenAI, DeepSeek, Anthropic-compat proxies, your self-hosted vLLM, etc.). Rewrites then go directly to your provider and <strong>don't count against the rewrite.so quota</strong>. You pay your provider, not us.</p>
<p>BYOK is a Pro feature ($7.99/mo billed annually). After upgrading, set it up in /settings.</p>
<p><a href="${escapeHtml(billingUrl)}" class="btn">See Pro plans →</a> &nbsp; <a href="${escapeHtml(docsUrl)}" style="color:#666">Read the FAQ</a></p>`,
      unsubUrl,
    ),
    text: `${greeting(r.name).replace(/[<>]/g, '')}

One week in. If you're near the monthly quota, BYOK is the answer:
plug in your own API key, rewrites go directly to your provider, no
quota cap.

BYOK is a Pro feature ($7.99/mo billed annually).

Plans: ${billingUrl}
FAQ: ${docsUrl}

Unsubscribe: ${unsubUrl}`,
  };
}

export function day14Email(r: EmailRecipient, ctx: TemplateContext): EmailTemplate {
  const billingUrl = `${ctx.webOrigin}/billing`;
  const unsubUrl = unsubscribeUrl(ctx, r);
  return {
    subject: 'Two weeks of rewrite.so — what would unlock more value?',
    html: shell(
      `<p>${greeting(r.name)}</p>
<p>You've been using rewrite.so for two weeks. Honest question: what's holding you back from upgrading to Pro?</p>
<ul>
  <li>If it's the monthly cap, Pro gives you 2,000/month plus BYOK for unlimited.</li>
  <li>If it's a missing feature, please reply and tell me what — I read every email.</li>
  <li>If you don't actually use it that much, that's fine too. Free tier stays free, no pressure.</li>
</ul>
<p><a href="${escapeHtml(billingUrl)}" class="btn">Upgrade to Pro →</a></p>
<p style="color:#888;font-size:13px">— Lin (the only person here)</p>`,
      unsubUrl,
    ),
    text: `${greeting(r.name).replace(/[<>]/g, '')}

Two weeks in. Honest question: what's holding you back from Pro?

- Hitting the cap → Pro gives 2,000/month + BYOK unlimited.
- Missing a feature → reply and tell me, I read every email.
- Don't use it much → free tier stays free, no pressure.

Pro: ${billingUrl}

— Lin

Unsubscribe: ${unsubUrl}`,
  };
}

export function day30Email(r: EmailRecipient, ctx: TemplateContext): EmailTemplate {
  const tryUrl = `${ctx.webOrigin}/try`;
  const unsubUrl = unsubscribeUrl(ctx, r);
  return {
    subject: '30 days. Are we still useful to you?',
    html: shell(
      `<p>${greeting(r.name)}</p>
<p>It's been a month. Either rewrite.so is part of your daily writing flow now, or you've forgotten about it. Both are useful signals to me — please reply with one word:</p>
<ul>
  <li><strong>"using"</strong> — it's stuck, no need to do anything else.</li>
  <li><strong>"sometimes"</strong> — works but not daily, what would tip the balance?</li>
  <li><strong>"forgot"</strong> — got distracted, here's a reminder: <a href="${escapeHtml(tryUrl)}">${escapeHtml(tryUrl)}</a>.</li>
  <li><strong>"not for me"</strong> — totally fine, I'll stop emailing.</li>
</ul>
<p>Last automated email from me. Anything after this is direct human-to-human.</p>
<p style="color:#888;font-size:13px">— Lin</p>`,
      unsubUrl,
    ),
    text: `${greeting(r.name).replace(/[<>]/g, '')}

30 days in. Reply with one word so I know:

- "using" — daily, no need to act
- "sometimes" — works but not daily, what would tip it?
- "forgot" — distracted, here's the reminder: ${tryUrl}
- "not for me" — fine, I'll stop emailing

This is the last automated one. Anything after is human-to-human.

— Lin

Unsubscribe: ${unsubUrl}`,
  };
}

// ===== shared HTML shell =====

function shell(body: string, unsubUrl: string): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:32px auto;padding:24px;color:#1f1f22;line-height:1.55">
<style>
  .btn { display:inline-block;padding:11px 22px;background:#111;color:#fff !important;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500 }
  kbd { padding:1px 6px;border:1px solid #d4d4d8;border-radius:4px;font-size:12px;font-family:inherit;background:#fafafa }
</style>
${body}
<hr style="margin:32px 0 16px;border:0;border-top:1px solid #eee">
<p style="color:#999;font-size:11px;line-height:1.5;margin:0">
  rewrite.so™ · An independent product. Not affiliated with OpenAI, Anthropic, or Google.
  Payments by <a href="https://creem.io" style="color:#999">Creem</a>, our Merchant of Record.<br>
  You're receiving this because you signed up at rewrite.so.
  <a href="${escapeHtml(unsubUrl)}" style="color:#999">Unsubscribe</a> from onboarding emails (transactional emails like login links and receipts will still be sent).
</p>
</body></html>`;
}

function unsubscribeUrl(ctx: TemplateContext, r: EmailRecipient): string {
  const params = new URLSearchParams({ user: r.userId, token: r.unsubscribeToken });
  return `${ctx.webOrigin}/unsubscribe?${params.toString()}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
