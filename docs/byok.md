# BYOK (Bring Your Own Key)

Pro users can plug in their own OpenAI-compatible endpoint and key. When
BYOK is configured:

- Rewrites bypass the platform default model and go directly to your provider.
- Your usage is **not counted against your monthly quota** (you pay your provider, not us).
- Short-term burst rate limits still apply (100 req/min) to prevent rewrite.so being used as a free reverse proxy.

## What you need

A standard **OpenAI-compatible Chat Completions** endpoint:

- An HTTPS base URL (e.g. `https://api.openai.com/v1`, `https://api.deepseek.com`, your self-hosted vLLM, etc.).
- A model name (e.g. `gpt-4o-mini`, `claude-3-5-sonnet-20241022`).
- An API key your provider issued.

Your provider must implement:

- `POST {baseUrl}/chat/completions` accepting `{ model, messages, stream: true }`.
- SSE response with `data: {"choices":[{"delta":{"content":"..."}}]}` frames.
- A final `data: [DONE]` frame.

If your provider is non-conformant (e.g. uses different field names),
rewrite.so will not work with it. We intentionally don't have per-vendor
shims.

## How to set it up

1. Sign in (Magic Link or Google).
2. Subscribe to Pro (`/billing`). BYOK is gated to Pro because the AES-GCM-encrypted-key path costs us storage + a tier of trust.
3. Open `/settings`. The BYOK panel only shows for Pro accounts.
4. Enter your **Base URL**, **Model**, and **API Key**.
5. Save. The key is encrypted with AES-GCM-256 before insert. You can never see it again — only the last 4 characters appear in the UI for confirmation.

## How your key is stored

- **At rest**: AES-GCM-256 ciphertext in the `byok_keys.encrypted_api_key` column. The 12-byte IV is unique per key and stored alongside.
- **In transit**: HTTPS to api.rewrite.so, then over `fetch()` to your provider's base URL.
- **In logs**: never. The plaintext key only exists as a local variable inside the request handler for the duration of one rewrite.
- **Master key**: a 32-byte AES-GCM key in the Worker's secrets. Rotating it invalidates all stored BYOK keys; users would need to re-enter.

## What you may not do

(See [Acceptable Use Policy](https://rewrite.so/aup) for the full list.)

- Don't use BYOK to operate rewrite.so as a public reseller / proxy of a third-party AI service.
- Don't enter API keys you don't have permission to use.
- Don't point the base URL at non-AI services (internal networks, etc.).

## Removing BYOK

Settings → BYOK panel → Delete. After deletion, your rewrites fall back to
the platform default model and start counting against the monthly quota
again.

## Self-hosting

If you self-host rewrite.so under a different name, you control the master
key and the entire path. See [self-hosting.md](./self-hosting.md).
