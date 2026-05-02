# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Onboarding email sequence (welcome / day 1 / day 7 / day 14 / day 30) — _planned_
- Cloudflare Web Store extension submission — _planned_

---

## [0.1.0] — 2026-05-02

The first cut. Everything from initial idea through live payment integration.

### Added

#### Core rewrite engine
- `POST /v1/rewrite` SSE endpoint with 3-way concurrent fan-out (faithful / casual / formal)
- Strict OpenAI Chat Completions wire format support
- Client-abort cascade to upstream (no more burning tokens after disconnect)
- 4000-character input cap (HTTP 413 above)
- `<think>...</think>` reasoning-tag stripping for reasoning-model responses (e.g. minimax-m25)

#### Trigger & input handling (`packages/core`)
- Double-tap Shift detector with 500 ms debounce window, modifier key guards, IME composition awareness, key repeat suppression
- Editable input detection for `<input>`, `<textarea>`, `contenteditable`, and `role="textbox"`
- **Hard PII exclusion**: password / autocomplete=cc-* / current-password / new-password / one-time-code / fields whose name or id contains password / pin / cvv / cvc / otp / secret / token
- Three-tiered text replacement (range setText, beforeinput, execCommand fallback) for compatibility with React-controlled inputs and ProseMirror / Lexical / Slate editors
- Closed Shadow DOM overlay UI (vanilla DOM, < 30 KB gzipped, no React)
- Auto-detect overlay positioning (above vs below input)
- Streaming skeleton → typing render transition

#### Auth & users
- Magic Link email sign-in via Resend
- better-auth + drizzle adapter (limited to its 4 internal tables)
- Cookie domain `.rewrite.so` for cross-subdomain session sharing
- User settings: target language, UI locale

#### Quotas & rate limiting
- Monthly quotas on D1 `usage_monthly`, aggregated by UTC calendar month
  - 10/month per IP for anonymous web visitors
  - 5/month per installId for unsigned extension users
  - 30/month for signed-in free users
  - 2,000/month for Pro
  - Unlimited for BYOK (with separate burst floor)
- Burst rate limiting via Durable Object token bucket (separate from monthly quota)
- Daily-rotated IP-hash salt for GDPR-friendly anonymous quota tracking

#### Subscriptions & billing (Phase 4)
- Creem integration as Merchant of Record (Pro Monthly $13.99, Pro Annual $7.99/mo)
- `POST /v1/billing/checkout` returning a Creem-hosted checkout URL
- `GET /v1/billing/portal` returning a customer self-service portal link
- `POST /webhooks/creem` with HMAC-SHA256 signature verification + event-id idempotency
- Subscription state machine (trialing → active → past_due → canceled → expired)
- Cancel-at-period-end semantics

#### BYOK (Bring Your Own Key)
- AES-GCM-256 encryption for stored API keys (12-byte random IV, master key from Worker secret)
- `GET / PUT / DELETE /v1/me/byok` endpoints; UI in `/settings`
- Plaintext key never logged, never returned in API responses (only last 4 chars as mask)
- BYOK requests skip monthly quota, only burst rate-limit applies (anti-reverse-proxy floor)

#### Web app (`apps/web`)
- Next.js 15 App Router on Cloudflare Workers via `@opennextjs/cloudflare`
- Public marketing pages: `/`, `/try`, `/pricing`
- Legal pages: `/terms`, `/privacy`, `/refund`, `/aup`, `/contact`
- Account pages: `/login`, `/settings`, `/billing`
- Global footer with all legal links + "Payments by Creem" disclaimer + AI-not-affiliated trademark disclaimer

#### Chrome extension (`apps/extension`)
- Manifest V3 + Vite + CRXJS
- Content script reuses `@rewrite/core`
- Background service worker proxies SSE through long-lived port
- Onboarding wizard (mandatory double-tap-Shift demo before completion)
- Popup showing remaining monthly quota
- Options page with BYOK form

#### Infrastructure
- Cloudflare Workers Paid plan ($5/mo)
- D1 database with hand-written SQL migrations (idempotent, auto-applied via CI)
- Durable Object for token-bucket rate limiter
- KV for short-lived caches
- GitHub Actions CI: lint + typecheck + test on every PR; auto-deploy api / web on push to main; tag-triggered extension release

### Documentation
- README in English with badge + license + trademark policy
- CONTRIBUTING.md with quality bar + non-acceptance list
- CODE_OF_CONDUCT.md (Contributor Covenant 2.1)
- TRADEMARK.md (rewrite.so™ unregistered trademark policy)
- LICENSE (Apache 2.0) + NOTICE
- `docs/architecture.md`, `docs/sse-protocol.md`, `docs/d1-schema.md`, `docs/byok.md`, `docs/privacy.md`, `docs/self-hosting.md`
- `CLAUDE.md` — project conventions for AI-assisted development

### Privacy commitment

- Input text and output rewrites are **never persisted** — not in databases, not in logs, not in error reporters, not in analytics
- No third-party APM / Sentry / Datadog (would risk capturing request bodies)
- IP addresses stored only as `sha256(ip + daily_salt)` truncated to 32 hex chars
- BYOK keys encrypted at rest with AES-GCM-256
- Cookie scope `.rewrite.so`, no tracking cookies

### Known unsupported

- Google Docs (canvas-rendered editor)
- Gmail compose (iframe + complex contenteditable)
- Inputs inside iframes (Manifest V3 `all_frames: false`)
- Firefox / Safari (planned for v0.2)

### License

Code: Apache 2.0. Name "rewrite.so", the wordmark "rewrite" in connection
with AI text rewriting, and the visual identity: unregistered trademarks
of Lin Shuaibin, see [TRADEMARK.md](./TRADEMARK.md).

[Unreleased]: https://github.com/rewrite-so/rewrite.so/compare/ext-v0.1.0...HEAD
[0.1.0]: https://github.com/rewrite-so/rewrite.so/releases/tag/ext-v0.1.0
