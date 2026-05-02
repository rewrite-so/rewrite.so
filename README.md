# rewrite.so™

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Trademark](https://img.shields.io/badge/trademark-policy-orange.svg)](./TRADEMARK.md)

> Double-tap Shift in any web input box to get 3 streaming AI rewrites instantly.

**rewrite.so** is an input-box-level AI rewrite engine. Translation, error
correction, and tone polishing are all unified into a single Rewrite Engine.
The entire interaction collapses into one gesture (double-tap Shift), and
the UI is invisible by default — only an 8 px translucent dot appears when
an editable input is focused. It does not steal focus, does not break your
flow.

- 🎯 **Three fixed styles** — *faithful*, *casual*, *formal*. Always three, no more.
- ⌨️ **Keyboard-only** — double-tap Shift to summon, `1`/`2`/`3` to accept, `Esc` to dismiss.
- 🔒 **Privacy by architecture** — input text and rewrite output are *never* persisted, anywhere. Password / CC / CVV / OTP fields are hard-excluded by design.
- 🌐 **Cross-language by default** — auto-detects the page language; cross-language rewriting is just implicit translation.
- 🔧 **BYOK** — Pro users can plug in their own OpenAI-compatible API key for unlimited usage.

## Quick start (development)

### Prerequisites

- Node 22+
- pnpm 9+
- A Cloudflare **Workers Paid plan** ($5/mo). Required for Durable Objects and CPU > 10 ms.

### Install

```bash
git clone https://github.com/rewrite-so/rewrite.so.git
cd rewrite.so
pnpm install
cp .env.example .env.local
# Fill in OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL, etc.
```

### Run end-to-end locally

Open three terminals:

```bash
# Terminal 1: mock upstream (skip if you have a real OpenAI-compatible key).
node scripts/mock-upstream.mjs        # listens on 127.0.0.1:9999

# Terminal 2: API.
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev:api                          # http://localhost:8787

# Terminal 3: Web.
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev:web                          # http://localhost:3000

# Extension: load apps/extension/dist as an unpacked extension at chrome://extensions
pnpm dev:ext
```

**Known gotcha (macOS users):** If your shell has `HTTP_PROXY` /
`HTTPS_PROXY` set, `wrangler dev` will route `fetch()` inside the worker
through that proxy — even calls to `localhost:9999`. Unset the proxy
variables before starting `pnpm dev:api`, or:

```bash
env -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy \
    -u ALL_PROXY -u all_proxy pnpm dev:api
```

### Check & build

```bash
pnpm typecheck    # TS type-check across all packages
pnpm test         # vitest across all packages
pnpm lint         # biome
pnpm fix          # biome auto-fix
pnpm build        # build all packages
```

### Deployment (CI/CD)

Deploys are automated via GitHub Actions in `.github/workflows/`:

| Workflow | Trigger | Behavior |
|---|---|---|
| `ci.yml` | PR + push to main | lint + typecheck + test |
| `deploy-api.yml` | push to main touching `apps/api/` or `packages/` | Deploys to `api.rewrite.so` |
| `deploy-web.yml` | push to main touching `apps/web/` or `packages/` | OpenNext build + deploys to `rewrite.so` |
| `release-extension.yml` | tag `ext-v*` | Builds zip + creates GitHub Release |
| `migrate-d1.yml` | manual dispatch | Runs D1 migrations remotely |

**First-time setup:** GitHub repo → Settings → Secrets and variables → Actions, add two repository secrets:
- `CLOUDFLARE_API_TOKEN` — needs `Workers Scripts:Edit` + `Workers KV Storage:Edit` + `D1:Edit` + `Zone DNS:Edit`
- `CLOUDFLARE_ACCOUNT_ID`

**Release the extension:**
```bash
git tag ext-v0.1.0 && git push --tags
```
The action builds a zip and creates a Release. Upload the zip manually to the Chrome Web Store for review.

**Manual deploy (bypass CI):**
```bash
pnpm --filter @rewrite/api deploy   # requires CLOUDFLARE_API_TOKEN env
pnpm --filter @rewrite/web deploy
```

## Repository layout

```
rewrite.so/
├── apps/
│   ├── api/         Cloudflare Workers + Hono   → api.rewrite.so
│   ├── web/         Next.js + OpenNext           → rewrite.so
│   └── extension/   Vite + CRXJS Chrome MV3
├── packages/
│   ├── core/        Input watcher, trigger, overlay UI (vanilla DOM, shared by web + extension)
│   ├── prompts/     The three system prompts
│   └── shared/      SSE frame types, shared constants, i18n strings
└── docs/            Architecture / SSE protocol / D1 schema / BYOK / privacy
```

## Tech stack

- **Infrastructure** — Cloudflare (Workers / D1 / Durable Objects / KV / Turnstile)
- **API** — [Hono](https://hono.dev) on Workers, 3-way concurrent SSE multiplexing, strict OpenAI Chat Completions wire format
- **Web** — Next.js 15 App Router via `@opennextjs/cloudflare` → Workers
- **Extension** — Chrome MV3 + Vite + CRXJS + Preact (popup / options only)
- **Auth** — better-auth + drizzle adapter (limited to its 4 internal tables; everything else is hand-written SQL)
- **Payments** — [Creem](https://creem.io) as Merchant of Record ($13.99/mo or $7.99/mo billed annually)
- **Code quality** — TypeScript + Biome + vitest + Playwright

## Known unsupported

- Google Docs (canvas-rendered editor)
- Gmail compose (iframe + complex contenteditable)
- Inputs inside iframes (MV3 `all_frames: false`)
- Firefox / Safari (planned for v0.2)

## Contributing

Bug reports, fixes, and PRs are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md)
before opening a PR. We follow the [Contributor Covenant Code of
Conduct](./CODE_OF_CONDUCT.md).

## License & trademark

Code is licensed under [Apache License 2.0](./LICENSE).

The name **rewrite.so**™, the **rewrite** wordmark in connection with AI
text rewriting, and the visual identity are unregistered trademarks of
Lin Shuaibin and are **not** covered by the Apache license. See
[TRADEMARK.md](./TRADEMARK.md) for details.

### Self-hosting & forks (TL;DR)

✅ **Self-host for personal or internal team use** — go ahead, no permission needed.

✅ **Fork and modify under a different name** — pick something distinct (e.g.
`MyEditorAI`), replace UI copy, and you’re free to redistribute.

❌ **Do not run a hosted SaaS** under the name `rewrite.so`, `rewrite`, or any
confusingly similar variant. The trademark exists so users know what they’re
getting when someone recommends "rewrite.so".

Full policy: [TRADEMARK.md](./TRADEMARK.md). Questions: hello@rewrite.so.
