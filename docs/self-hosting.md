# Self-hosting rewrite.so

The Apache 2.0 license lets you run this code anywhere. The
[trademark policy](../TRADEMARK.md) constrains what you can call your
deployment — pick a different name if you distribute or operate it
publicly.

This guide is for getting your own copy of the stack running on
Cloudflare Workers + D1 + a domain you control.

## What you'll need

- A Cloudflare account on the **Workers Paid plan** ($5/mo). Required because Free doesn't support Durable Objects, and the rewrite path can exceed 10 ms CPU.
- A domain you can configure DNS on, ideally one you've moved to Cloudflare.
- An OpenAI-compatible LLM API key (OpenAI, DeepSeek, vLLM, etc.).
- A [Resend](https://resend.com) account + a verified sender domain.
- (Optional but recommended) A [Creem](https://creem.io) merchant account if you want subscriptions.
- (Optional) A Google OAuth client if you want sign-in with Google.

## Initial setup

```bash
git clone https://github.com/rewrite-so/rewrite.so.git my-rewrite
cd my-rewrite
pnpm install
```

### Pick a new name (mandatory)

Find-and-replace `rewrite.so` and `rewrite-so` across the repo with your
new name. The trademark policy requires this for anything public-facing.

```bash
# example
git grep -l 'rewrite\.so' | xargs sed -i '' 's/rewrite\.so/yourname/g'
git grep -l 'rewrite-so' | xargs sed -i '' 's/rewrite-so/yourname/g'
```

Update logos / icons too.

### Cloudflare resources

Create these once via `wrangler`:

```bash
# D1 database
wrangler d1 create yourname-db
# Copy the returned database_id into apps/api/wrangler.toml

# KV namespace
wrangler kv namespace create yourname-kv
# Copy the returned id into apps/api/wrangler.toml

# Apply schema
cd apps/api
wrangler d1 migrations apply yourname-db --remote
```

### Secrets

Set Worker secrets via `wrangler secret put`:

```bash
# In apps/api/
wrangler secret put OPENAI_BASE_URL          # https://api.openai.com/v1 (or your provider)
wrangler secret put OPENAI_API_KEY            # your provider key
wrangler secret put OPENAI_MODEL              # e.g. gpt-4o-mini
wrangler secret put BYOK_MASTER_KEY           # base64(openssl rand 32)
wrangler secret put BETTER_AUTH_SECRET        # any 32+ char random string
wrangler secret put BETTER_AUTH_URL           # https://api.yourname.com
wrangler secret put WEB_ORIGIN                # https://yourname.com
wrangler secret put RESEND_API_KEY            # re_xxx from Resend
wrangler secret put RESEND_FROM_EMAIL         # hello@yourname.com (must be verified in Resend)

# Optional (subscriptions)
wrangler secret put CREEM_API_KEY
wrangler secret put CREEM_WEBHOOK_SECRET
wrangler secret put CREEM_PRO_MONTHLY_PRODUCT_ID
wrangler secret put CREEM_PRO_YEARLY_PRODUCT_ID
```

For the web Worker (`apps/web/`), set `API_BASE_URL` as a build-time env in
your CI deploy step (it's baked into Next.js rewrites at build time, not
read at runtime — see CLAUDE.md).

### DNS

Point `yourname.com` and `api.yourname.com` to Cloudflare and add the routes:

```toml
# apps/api/wrangler.toml
routes = [{ pattern = "api.yourname.com", custom_domain = true }]

# apps/web/wrangler.toml
routes = [{ pattern = "yourname.com/*", zone_name = "yourname.com" }]
```

### Deploy

```bash
pnpm --filter @rewrite/api deploy
pnpm --filter @rewrite/web build && pnpm --filter @rewrite/web deploy
```

The Chrome extension is independent; build with `pnpm --filter
@rewrite/extension build` and submit the resulting zip to the Chrome Web
Store under your own developer account.

## What you give up vs. using rewrite.so

- You operate everything. You are the merchant of record (or subcontract one yourself).
- You're responsible for legal compliance in your jurisdictions (GDPR, CCPA, etc.).
- You handle support yourself.
- You pay for LLM tokens, Cloudflare compute, Resend emails directly.

## What you keep

- Same code, same privacy contract (assuming you don't break it).
- Same architecture. Scales the same way (CF Workers is generous).
- Updates: pull from upstream periodically. We use semver-ish tags.

## Common gotchas

- **macOS proxy**: if you have `HTTP_PROXY` set, `wrangler dev` will route Worker `fetch()` calls through it including localhost. Unset before running.
- **OpenNext build env**: `API_BASE_URL` is baked at build time. Don't try to set it at runtime via `wrangler.toml [vars]`.
- **D1 migrations**: never modify a migration that's been applied. Add `0002_fix_*.sql` instead.
- **Magic Link cookie domain**: in dev you can use `localhost` for both web and api. In prod the cookie has to be on the apex domain (`.yourname.com`) so subdomain workers share it.

## Questions

[GitHub Discussions](https://github.com/rewrite-so/rewrite.so/discussions) or hello@rewrite.so.
