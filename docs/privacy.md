# Privacy — technical implementation

Companion to [the user-facing Privacy Policy](https://rewrite.so/privacy).
This doc explains *how* the privacy commitments are implemented in the
code. If you're considering the project for an audit or self-hosting, this
is the page for you.

## The hard commitment

> **rewrite.so never stores the text you rewrite, or the rewrites we produce.**

This is a contract enforced by code review and explicit anti-patterns in
the linter and CLAUDE.md. Specifically:

1. The `/v1/rewrite` handler does **not** persist `req.text` to D1, KV, or any external service.
2. The streaming response chunks (`event: delta` frames) are **not** captured to logs.
3. Error reporting (`onError` in `apps/api/src/index.ts`) explicitly redacts request bodies.
4. No third-party APM is integrated. We don't use Sentry / Datadog / NewRelic — they'd see request bodies by default and getting redaction right is too easy to accidentally break.

## What we do log (operational only)

When we say "logs," we mean Cloudflare Workers Logs, accessible via
`wrangler tail`. They contain:

- **Request length in characters** (e.g. `length=1234`) — for cost analysis.
- **Detected target language** (e.g. `lang=zh-CN`).
- **Style requested** (e.g. `style=faithful`).
- **HTTP status code** (200, 429, 502).
- **Subject identifier** — userId for signed-in, hashed installId for unsigned extension, hashed-with-rotating-salt IP for anonymous.
- **Error category** (e.g. `code=upstream_timeout`).

What we never log:

- ❌ The input text or any substring of it.
- ❌ The output text or any chunk thereof.
- ❌ User email addresses.
- ❌ Plain IPs (we only ever see `sha256(ip + daily_rotating_salt)` truncated to 32 hex chars).
- ❌ API keys (BYOK or platform default).

## Data we do persist (in D1)

- `users` — id, email, name, avatar URL.
- `usage_monthly` — count per (subject, month). Just numbers.
- `subscriptions` — Creem mirror metadata. No card details.
- `byok_keys` — AES-GCM-256-encrypted key + base URL + model + last 4 chars (mask).
- `user_settings` — target language, UI locale.
- `webhook_events` — Creem event IDs for idempotency. Body has only event metadata.

See [d1-schema.md](./d1-schema.md) for the full table reference.

## IP handling

We never store raw IP addresses. The function `hashIp(ip, secret, date)` in
`apps/api/src/lib/quota.ts`:

1. Takes the IP, today's UTC date, and `BETTER_AUTH_SECRET`.
2. Computes `SHA-256(ip + "|" + date + "|" + secret)`.
3. Returns the first 32 hex characters.

The `date` component means **the same IP produces a different hash tomorrow**, so we can't cross-correlate a user across days from the IP alone. This is an intentional GDPR-friendly design (you can't be re-identified retroactively from old logs).

The cost: anonymous quota counting resets at the day boundary as well as the month. We accept this — anonymous quotas are already small.

## Cookie scope

One cookie: the better-auth session token. Scoped to `.rewrite.so` so the
extension and the website share authentication. No tracking cookies. No
third-party advertising cookies.

## Third parties

These four hold data about you. They're listed in the [Privacy Policy](https://rewrite.so/privacy).

- **Cloudflare** — hosts everything (compute + D1 + KV + DO + edge).
- **OpenAI-compatible LLM provider** — receives your input text in real time, then forgets it (subject to that provider's retention policy). With BYOK, your text goes to your provider, not ours.
- **Creem** — merchant of record for payments. Receives card and billing details when you subscribe. We only see resulting subscription state.
- **Resend** — sends transactional emails (login links, billing receipts). Sees your email address.

## Auditing

The project is open source. Every privacy claim above can be verified by
reading the code. Specific files of interest:

- `apps/api/src/routes/rewrite.ts` — the data path. Search for `console.log` / `console.error` and confirm no `req.text` or response chunks are passed.
- `apps/api/src/lib/quota.ts` — IP hashing.
- `apps/api/src/lib/crypto.ts` — BYOK AES-GCM encrypt/decrypt.
- `apps/api/src/index.ts` — the `onError` handler (no request bodies).

If you find a privacy violation, please email `hello@rewrite.so` with subject `Security`. We respond within 5 business days.
