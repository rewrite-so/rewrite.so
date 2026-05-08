# Admin Rollout — Main Repo Changes

This document describes the **public, business-neutral** changes required in this
repository (`rewrite-so/rewrite.so`) to support a separately-developed,
closed-source admin / operations worker. The admin worker itself lives outside
this repository and consumes data via the same Cloudflare account's D1 database
plus a small set of contracts defined here.

The goal of this document is to make those contracts explicit so contributors
can review related PRs without needing visibility into the operations stack.

## Why this exists

`rewrite.so` is entering operations phase. We need monitoring, account
management, billing reconciliation, and broadcast tooling that depend on:

1. Per-request telemetry (latency, error codes, tier distribution)
2. Server-side mechanisms to express operational decisions (manual tier
   override, account ban, banner announcements)
3. A stable contract that any out-of-band admin tooling can rely on

These are minimal, business-neutral hooks. None of them embed operational
strategy or admin auth flows in this repo — those live elsewhere.

## Scope: 4 contracts added to this repo

### 1. Analytics Engine binding & request metrics helper

- `apps/api/wrangler.toml`: add `[[analytics_engine_datasets]]`
  with `binding = "METRICS"`, `dataset = "rewrite_requests"`.
- `apps/api/src/lib/metrics.ts` (new): exposes `writeRequestEvent(env, fields)`
  that writes one data point per request. The accepted field set is:

  ```ts
  type RequestMetric = {
    tier: 'anonymous_ip' | 'anonymous_install' | 'free' | 'pro' | 'byok'
    style: 'faithful' | 'casual' | 'formal'
    target_lang: string         // standard locale, or sanitized custom (≤ 30 chars)
    target_lang_is_custom: boolean
    input_length_bucket: '<100' | '<500' | '<1000' | '<2000' | '<4000'
    ms_to_first_byte?: number
    ms_total?: number
    upstream: 'platform' | 'byok'
    status: 'ok' | 'aborted' | 'upstream_error' | 'quota_exceeded' | 'banned' | 'invalid'
    error_code?: string
    user_id_hash?: string       // SHA-256("user_id_v1:" + id) → first 16 hex chars
  }
  ```

  **Privacy invariants** (continuation of the existing rules in `CLAUDE.md`):
  - Never include the user's input text, model output, raw IP, or email.
  - Custom `target_lang` strings go through `lib/sanitize-target-lang.ts`
    (already present, used by `/v1/rewrite`) and are truncated to 30 chars.
  - The `user_id_hash` algorithm is fixed (the `v1` suffix protects future
    changes); raw user IDs never enter Analytics Engine.

- `apps/api/src/routes/rewrite.ts`: emit `writeRequestEvent` at three points:
  first SSE chunk (`ms_to_first_byte`), stream completion (`status='ok'`),
  and exception branches (`upstream_error` / `quota_exceeded` / `banned` /
  `aborted`).

### 2. `admin_user_overrides` table — manual tier override

Subscription state is driven by Creem webhooks. Operations sometimes needs to
grant or revoke Pro access without going through Creem (e.g. comping,
disputes, error correction). Writing directly to `subscriptions` would race
the webhook state machine.

We add an additive table:

```sql
CREATE TABLE admin_user_overrides (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  force_tier TEXT NOT NULL,        -- 'pro' | 'free'
  reason     TEXT NOT NULL,
  expires_at INTEGER,              -- Unix seconds; NULL = permanent
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

`apps/api/src/lib/quota.ts` `resolveUserTier()` queries this table first
(KV-cached per the standard cache rule below). If a non-expired row exists,
its `force_tier` wins; otherwise the original subscriptions lookup runs.

### 3. `user_bans` table + ban-check middleware

```sql
CREATE TABLE user_bans (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  reason     TEXT NOT NULL,
  banned_by  TEXT NOT NULL,
  banned_at  INTEGER NOT NULL,
  expires_at INTEGER               -- NULL = permanent
);
```

`apps/api/src/middleware/ban-check.ts` (new) runs after better-auth has
resolved the session and before any authenticated route handler. If the user
has an active ban row, the response is `401 { error: 'user_banned', reason }`.

This covers `/v1/rewrite` (logged-in path), all `/v1/me/*`, and billing
endpoints. Anonymous install/IP paths are not affected (those are governed
by quota and Turnstile alone).

### 4. `announcements` table + public `GET /v1/announcements`

```sql
CREATE TABLE announcements (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,                 -- 'banner' | 'modal'
  surfaces      TEXT NOT NULL,                 -- JSON array, e.g. ["web","extension"]
  locale_filter TEXT,                          -- single locale or NULL
  tier_filter   TEXT,                          -- 'free' | 'pro' | NULL = everyone
  title_i18n    TEXT NOT NULL,                 -- JSON: { "en": "...", ... }
  body_i18n     TEXT NOT NULL,
  cta_i18n      TEXT,                          -- JSON: { "en": {label, href}, ... }
  starts_at     INTEGER NOT NULL,
  ends_at       INTEGER NOT NULL,
  priority      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_announcements_window ON announcements(starts_at, ends_at);
```

`apps/api/src/routes/announcements.ts`:

- `GET /v1/announcements?locale=&surface=` returns currently-active rows.
- **`tier_filter` is server-resolved** — the endpoint never accepts a
  client-supplied tier. It reads the better-auth session (or anonymous) and
  resolves the tier via the existing `resolveUserTier()` helper. Anonymous
  callers see only rows with `tier_filter IS NULL`. This prevents a third
  party from probing `?tier=pro` to discover Pro-only operational content.
- **No server-side cache.** The `announcements` table has very few active rows
  (operationally hand-written, on the order of single digits per month), so
  every GET hits D1 directly. This means admin writes take effect on the next
  read — no invalidation protocol to maintain. The response carries
  `Cache-Control: max-age=60` so browsers (web/extension) cache it client-side.

The web/extension consumption (rendering banners) is not part of this rollout
and will land in a separate change.

## Shared invariants

### KV cache for low-cardinality lookup tables

`admin_user_overrides` and `user_bans` are queried on the hot path of
`/v1/rewrite`. To avoid double D1 reads per request:

- Read path: try KV first (`override:{user_id}` / `ban:{user_id}`, TTL 5min).
  Cache misses fall through to D1; the result (including `__none__` sentinel
  for absence) is written back.
- Write path: the operations stack invalidates the cache via `KV.delete()`
  after writing to D1. (The admin worker shares this KV namespace.)

### `user_id_hash` algorithm

Both repos (this one and the closed admin repo) compute the same hash so
metrics can be correlated:

```
SHA-256("user_id_v1:" + raw_user_id)  →  hex  →  first 16 chars
```

Changing this algorithm requires bumping the `v1` suffix and accepting that
older Analytics Engine data becomes uncorrelatable.

## D1 migrations: number range convention

To allow the admin repo to evolve schema without coordinating each PR, the
migration filename space is partitioned:

| Range          | Owner                                    |
|----------------|------------------------------------------|
| `0001`–`7999`  | This repo (`apps/api/src/db/migrations/`) |
| `8000`–`9999`  | Closed admin repo                         |

Both repos run `wrangler d1 migrations apply rewrite-so --remote` against the
same D1 database. The `d1_migrations` table is wrangler-managed and de-dupes
already-applied files by name, so the two streams don't conflict in practice.

**Do not allocate migration numbers ≥ 8000 in this repo.** This is mirrored
in the project `CLAUDE.md`.

## Schema-change coordination

Business tables (`users`, `subscriptions`, `usage_monthly`, `byok_keys`,
`user_settings`, `user_email_state`) are read by the admin worker. PRs in
this repo that **add, rename, retype, or remove fields** on those tables
must include a note in the PR description so the admin maintainer can update
their code in lockstep. There is no automated check for this — it relies on
contributor discipline.

The admin repo, in turn, maintains a `README` changelog of which main-repo
migrations it has aligned to.

## Testing

Each contract above ships with unit tests in `apps/api/test/`:

- `metrics.test.ts` — type-level field whitelist; sanitization of custom
  `target_lang`.
- `quota.test.ts` — `resolveUserTier` priority order with overrides.
- `bans.test.ts` — middleware short-circuits authenticated routes; expired
  bans don't trigger; anonymous paths are unaffected.
- `announcements.test.ts` — locale/surface filtering, tier server-resolution,
  KV cache hit/miss.

## Out of scope

- Admin authentication, audit logging, rollback/cooldown semantics — entirely
  in the closed admin repo.
- Web/extension UI for announcements — separate change.
- A/B experimentation, automated retention policies — future work.
