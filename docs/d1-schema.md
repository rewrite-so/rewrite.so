# D1 schema reference

Source of truth: `apps/api/src/db/migrations/`. This doc is human-readable
context. If they disagree, the migration files win.

## Tables

### `users` — better-auth core

Columns: `id` (PK), `email` (UNIQUE), `email_verified` (0/1), `name`, `image`, `created_at`, `updated_at`.

### `sessions` — better-auth core

Columns: `id` (PK), `user_id` (FK), `expires_at`, `token` (UNIQUE), `ip_address`, `user_agent`, timestamps. Indexed by `user_id` and `token`.

### `accounts` — better-auth account linkage

Columns: `id` (PK), `user_id` (FK), `account_id`, `provider_id`, provider token columns (used only if a social/OAuth provider is enabled), `password` (only used by email-password auth, currently unused), timestamps. Unique on `(provider_id, account_id)`.

### `verifications` — better-auth (Magic Link / OTP)

Columns: `id` (PK), `identifier` (the email / phone), `value` (the token), `expires_at`, timestamps.

### `subscriptions` — Creem mirror

Columns: `id` (PK = creem `sub_*` id), `user_id` (FK), `creem_subscription_id` (UNIQUE), `creem_customer_id`, `product_id`, `plan` (`'monthly' | 'yearly'`), `status` (`'trialing' | 'active' | 'paused' | 'past_due' | 'canceled' | 'expired'`), `current_period_start`, `current_period_end`, `cancel_at_period_end`, timestamps.

`resolveUserTier(userId)` (in `apps/api/src/lib/quota.ts`) is the single source of truth for `free` vs `pro`. It treats `active | trialing | paused` as Pro, plus `canceled` whose `current_period_end > now()`. Everything else is free.

### `usage_monthly` — quota counters

Columns: `subject_kind` (`'user' | 'install' | 'ip'`), `subject_id`, `month_utc` (`'YYYY-MM'`), `count`, `byok_count`, `updated_at`. PK: `(subject_kind, subject_id, month_utc)`.

The composite `subject_id` lets us count anonymous (ip-hashed), unsigned-extension (installId), and signed-in (userId) users in the same table.

`subject_id` for IPs is `sha256(ip + daily_salt)` truncated to 32 hex chars. The salt rotates daily so cross-day correlation is impossible (GDPR).

### `byok_keys`

Columns: `user_id` (PK / FK), `base_url`, `model`, `encrypted_api_key` (base64 AES-GCM ciphertext), `iv` (base64), `key_version` (always 1 for now), `key_mask` (last 4 chars of the plaintext key, for UI confirmation only), timestamps.

Encryption uses `BYOK_MASTER_KEY` (32-byte AES-GCM key, base64-encoded as a Worker secret). Rotating the master key invalidates all stored keys; users have to re-enter.

### `user_settings`

Columns: `user_id` (PK / FK), `target_lang` (default `'auto'`), `ui_locale` (default `'auto'`), `updated_at`.

### `webhook_events` — idempotency for Creem

Columns: `event_id` (PK = Creem `evt_*`), `source` (always `'creem'` today), `received_at`, `payload` (only event metadata, never sensitive details).

We `INSERT OR IGNORE` then check; if the row already exists we treat it as already-handled and return 200 with `{ ok: true, idempotent: true }`. This prevents replay attacks and double-processing.

## What is NOT stored

- ❌ Input text (the thing the user typed for rewriting)
- ❌ Output text (the rewrites we produced)
- ❌ Plaintext API keys (BYOK is encrypted)
- ❌ IP addresses (only the rotating-salt hash)
- ❌ Card numbers, CVV (Creem holds those, not us)

This is a hard architectural commitment, enforced by code review and called out in [privacy.md](./privacy.md).

## Migrations

`wrangler d1 migrations apply rewrite-so --remote` is idempotent. Applied
migrations are tracked in the `d1_migrations` table; new files run in
filename order. **Never modify a migration that has been deployed.** If the
schema is wrong, add `0002_fix_*.sql` to correct it.

CI runs migrations automatically on every API deploy
(`.github/workflows/deploy-api.yml`).
