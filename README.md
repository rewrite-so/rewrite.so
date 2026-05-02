# rewrite.so™

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Trademark](https://img.shields.io/badge/trademark-policy-orange.svg)](./TRADEMARK.md)

> 在任何网页输入框双击 Shift，立刻拿到 3 种风格的 AI 改写。
>
> *Double-tap Shift in any web input box to get 3 style rewrites instantly.*

rewrite.so 是一款"输入框级"AI 改写引擎。统一处理翻译、纠错和润色——本质是一个 Rewrite Engine。所有交互收敛到一个手势（双击 Shift），UI 默认隐身（输入框聚焦时右下角 8px 半透明小点），不抢焦点、不打断心流。

- 🎯 **3 风格固定**：贴近原文 / 口语 / 正式
- ⌨️ **全键盘**：双击 Shift 触发，`1/2/3` 直采，`Esc` 取消
- 🔒 **隐私优先**：完全不记录原文与改写结果；密码框/CVV/OTP 等 PII 输入框硬排除
- 🌐 **跨语种自动**：自动检测页面语言，跨语言改写就是隐式翻译
- 🔧 **BYOK**：Pro 用户可填自己的 OpenAI 兼容 API key，无限使用

## 快速开始（开发）

### 前置要求

- Node 22+
- pnpm 9+
- Cloudflare Workers **Paid plan**（$5/月，DO + CPU > 10ms 必需）

### 安装

```bash
git clone https://github.com/rewrite-so/rewrite.so.git
cd rewrite.so
pnpm install
cp .env.example .env.local
# 填入 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL 等
```

### 本地开发（端到端）

打开 3 个终端：

```bash
# 终端 1：mock 上游（如果你有真实 OpenAI 兼容 key 可跳过）
node scripts/mock-upstream.mjs   # listen on 127.0.0.1:9999

# 终端 2：API（需先复制 .dev.vars.example 到 .dev.vars 并填值）
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev:api                      # http://localhost:8787

# 终端 3：网页
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev:web                      # http://localhost:3000

# 扩展（dev 期间在 chrome://extensions 加载 apps/extension/dist 未打包）
pnpm dev:ext
```

**已知坑（macOS 用户）**：如果你的环境有 `HTTP_PROXY` / `HTTPS_PROXY`，wrangler dev 会让 worker 内的 fetch 走代理，连 localhost:9999 都会失败。启 `pnpm dev:api` 前 `unset` 代理变量，或者用：

```bash
env -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy -u ALL_PROXY -u all_proxy pnpm dev:api
```

### 检查与构建

```bash
pnpm typecheck    # 全 package TS 类型检查
pnpm test         # 全 package 测试
pnpm lint         # biome 检查
pnpm fix          # biome 自动修复
pnpm build        # 全 package 构建
```

### 部署（CI/CD）

GitHub Actions 自动部署，配置在 `.github/workflows/`：

| Workflow | 触发 | 行为 |
|---|---|---|
| `ci.yml` | PR + push main | lint + typecheck + test |
| `deploy-api.yml` | push main 改 `apps/api/` 或 `packages/` | 部署到 `api.rewrite.so` |
| `deploy-web.yml` | push main 改 `apps/web/` 或 `packages/` | OpenNext build + 部署到 `rewrite.so` |
| `release-extension.yml` | tag `ext-v*` | 构建 zip + 创建 GitHub Release |
| `migrate-d1.yml` | 手动 dispatch | 远程跑 D1 migrations（输入 file 名或全部） |

**首次配置**：GitHub repo Settings → Secrets and variables → Actions，加两个 repository secret：
- `CLOUDFLARE_API_TOKEN`：要权限 `Workers Scripts:Edit + Workers KV Storage:Edit + D1:Edit + Zone DNS:Edit`
- `CLOUDFLARE_ACCOUNT_ID`：`fac906e305f0f4df576524f107365e35`

**发扩展**：
```bash
git tag ext-v0.1.0 && git push --tags
```
Action 会构建 zip + 创建 Release。zip 手动上传到 Chrome Web Store 审查。

**手动部署**（绕过 CI）：
```bash
pnpm --filter @rewrite/api deploy   # 需 CLOUDFLARE_API_TOKEN env
pnpm --filter @rewrite/web deploy
```

## 仓库结构

```
rewrite.so/
├── apps/
│   ├── api/         Cloudflare Workers + Hono   → api.rewrite.so
│   ├── web/         Next.js 15 + OpenNext       → rewrite.so
│   └── extension/   Vite + CRXJS Chrome MV3
├── packages/
│   ├── core/        输入框监听 + 触发 + 浮层 UI（插件和网页共用，纯 DOM）
│   ├── prompts/     3 风格 system prompt
│   └── shared/      SSE 帧类型 + 共享常量 + i18n 字符串
└── docs/            架构 / SSE 协议 / D1 schema / BYOK / 隐私
```

## 技术栈

- **基础设施**：Cloudflare 全家桶（Workers / D1 / Durable Objects / KV / Turnstile）
- **API**：Hono on Workers，3 路并发 SSE 多路复用，严格 OpenAI Chat Completions 协议
- **网页**：Next.js 15 App Router via @opennextjs/cloudflare → Workers
- **扩展**：Chrome MV3 + Vite + CRXJS + Preact（popup/options）
- **Auth**：better-auth + drizzle adapter（仅 4 张 better-auth 表）
- **支付**：Creem（月付 $13.99 / 年付 $8/月）
- **代码质量**：TypeScript + Biome + vitest + Playwright

## 已知不支持

- Google Docs（canvas 渲染）
- Gmail compose（iframe + 复杂 contenteditable）
- iframe 内输入框（MV3 `all_frames: false`）
- Firefox / Safari（v0.2 适配）

## License & trademark

Code is licensed under [Apache License 2.0](./LICENSE).

The name **rewrite.so**™, the **rewrite** wordmark in connection with AI text
rewriting, and the visual identity are unregistered trademarks of
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
