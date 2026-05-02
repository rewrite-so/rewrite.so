# Architecture

## High-level data flow

```
                             ┌────────────────┐
  ┌──────────────────┐       │                │
  │  Chrome MV3      │       │   rewrite.so   │
  │  Extension       │ ───►  │   Web (Next.js │       ┌─────────────┐
  │  (content script │       │   on CF Workers│ ───►  │             │
  │  + background SW)│       │   via OpenNext)│       │  api.       │
  └──────────────────┘       └────────────────┘       │  rewrite.so │
                                                       │  (Hono on   │
  ┌──────────────────┐                                 │   CF        │
  │  Web /try demo   │ ─────────────────────────────►  │   Workers)  │
  │  (no install)    │                                 │             │
  └──────────────────┘                                 └──────┬──────┘
                                                              │
                              ┌───────────────┬───────────────┼───────────────┬─────────────┐
                              ▼               ▼               ▼               ▼             ▼
                        ┌────────┐     ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌─────────┐
                        │   D1   │     │     KV     │  │ Durable    │  │  LLM     │  │  Resend │
                        │        │     │            │  │ Object     │  │  upstream│  │  email  │
                        │ users/ │     │  config    │  │ (token     │  │  (OpenAI │  │         │
                        │ usage/ │     │  cache     │  │  bucket    │  │   compat)│  │         │
                        │ subs   │     │            │  │  rate lim) │  │          │  │         │
                        └────────┘     └────────────┘  └────────────┘  └──────────┘  └─────────┘
                                                                              │
                                                                              ▼
                                                                       ┌─────────────┐
                                                                       │  Creem      │
                                                                       │  (Merchant  │
                                                                       │   of Record)│
                                                                       └─────────────┘
```

## Component breakdown

### `apps/web` — Marketing + auth + user dashboard

- **Next.js 15 App Router**, deployed via `@opennextjs/cloudflare` to a single Worker.
- Public pages: `/`, `/try`, `/pricing`, `/terms`, `/privacy`, `/refund`, `/aup`, `/contact`.
- Authenticated pages: `/login`, `/settings`, `/billing`.
- All `/api/auth/*` and `/v1/*` paths are rewritten server-side to `api.rewrite.so` (see [SSE protocol](./sse-protocol.md) for why).
- Cookie domain is `.rewrite.so` so the extension and the website share session.

### `apps/api` — All real logic

- **Hono on CF Workers**.
- Routes:
  - `POST /v1/rewrite` — the core SSE endpoint (3-way fan-out).
  - `GET/POST /api/auth/*` — better-auth handler (Magic Link + Google OAuth).
  - `GET /v1/me`, `/v1/me/usage`, `/v1/me/settings`, `/v1/me/byok` — account dashboard.
  - `POST /v1/billing/checkout`, `GET /v1/billing/portal` — Creem checkout.
  - `POST /webhooks/creem` — Creem webhook handler with HMAC-SHA256 verification.
- Storage:
  - **D1**: `users`, `sessions`, `accounts`, `verifications` (better-auth) + `subscriptions`, `usage_monthly`, `byok_keys`, `user_settings`, `webhook_events`.
  - **KV**: short-lived caches.
  - **Durable Object** `RateLimiter`: token bucket (5 req/min/installId, separate from monthly quota).

### `apps/extension` — Chrome MV3 extension

- Content script hosts `@rewrite/core` (vanilla DOM, no framework).
- Background service worker proxies SSE requests to `api.rewrite.so` (cookies are extension-scoped via `host_permissions`).
- Popup + options page use Preact (popup/options only — content script stays framework-free).

### `packages/core` — Shared, framework-free

- The `mount(opts)` function used by both `apps/web/(app)/try` and `apps/extension`.
- Trigger detection (double-tap Shift), input box detection, PII exclusion, contenteditable replace, Shadow DOM overlay UI — all in vanilla TypeScript, < 30 KB gzipped.
- Reused unchanged across both hosts (`host: 'web' | 'extension'`).

## See also

- [SSE protocol](./sse-protocol.md) — the wire format for `/v1/rewrite`.
- [D1 schema](./d1-schema.md) — table-by-table reference.
- [BYOK](./byok.md) — how the bring-your-own-key path works.
- [Self-hosting](./self-hosting.md) — running your own deployment.
