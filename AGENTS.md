# AGENTS.md

本文件仅记录"未来 Codex 必须知道、且无法从代码或 git log 推导"的项目约定。
代码自解释的内容（目录结构、文件清单、API 列表、`package.json scripts` 命令）一律不写在这里——它们在 README 或代码本身。

## 产品契约（不可静默更改）

- **3 风格契约**：固定为 `faithful / casual / formal`（中文标签：贴近原文 / 口语 / 正式）。修改 `packages/prompts` 后必须人工 sample ≥5 组中/英输入，确认 3 种风格差异未塌陷。自动测试无法保证语义差异。
- **触发去抖窗口 500ms**：误触和延迟的权衡值，不要随意调。
- **候选数固定 3，不能加第 4 个**（产品决策）。
- **不加自定义 prompt 输入框**（产品决策；BYOK 仅替换 endpoint，不让用户改 prompt）。
- **目标语言默认"自动检测页面语言"**：用户在 onboarding/设置中可改为固定语言。临时覆盖（每次切换）MVP 不做。
- **单次输入字符上限 4000**：成本控制。改动需重新评估单次成本。

## 隐私与安全（硬约束）

- **完全不记录原文与改写结果**：错误日志、telemetry、Cloudflare Logs/Logpush、任何 APM 都不得携带原文/输出文本。仅可记 `length / lang / style / userId / 错误码`。
- **PII 输入框硬排除**：`packages/core/src/editable/detect.ts` 中硬编码的排除规则：
  - `<input type="password" | "hidden">`
  - `autocomplete` 含 `cc-* / current-password / new-password / one-time-code`
  - `name` 或 `id` 含 `password|pin|cvv|cvc|otp|secret|token`（不区分大小写）
  - `readonly / disabled`
  
  不能因 PR 简化而删减，这是用户隐私底线。
- **Shadow DOM 用 `closed` mode**：阻止宿主页脚本枚举我们的浮层（隐私 + 防广告拦截器误杀）。

## 后端实现要点

- **SSE delta 帧 data 必须整行 JSON.parse**：上游 chunk 含换行须转义为 `\n`，前端解析器逐行处理。
- **SSE AbortSignal 链式透传**：客户端断开时 Worker 必须级联 abort 3 路 upstream fetch（`req.signal` → 3 路 fetch.signal），否则继续烧 token。
- **上游协议严格 OpenAI Chat Completions SSE**：仅认 `choices[0].delta.content`，不为 vendor 自创字段做兼容层。BYOK 用户用其它 vendor 自担兼容性。
- **D1 不支持 RETURNING * 的全部场景**：用先 `INSERT` 后 `SELECT by id`，不要假设 RETURNING 总能用。
- **drizzle 仅给 better-auth 4 张表用**：业务表保持裸 SQL，这是"D1 不用 ORM"原则的唯一例外。不要顺手把业务表也搬到 drizzle。
- **D1 不用 ORM 迁移工具**：手写 `migrations/NNNN_xxx.sql`，文件名严格按 4 位数字编号。
- **better-auth session 是 cookie 不是 Bearer**：扩展必须 background 代理请求
- **Magic Link 邮件链接 = api origin（不能改成 web origin）**：
  曾尝试把链接 host 替换成 web origin，靠 next rewrites 代理 verify 到 api。但
  **OpenNext 在 Cloudflare Workers 上对 GET `/api/auth/magic-link/verify?token=...` 这种
  GET + 长 query 的 rewrite 有 bug 返 404**（同 path 不带 query 的 GET 和 POST 都正常）。
  因此 sendMagicLink 不再做 host 替换，让浏览器直接打 `https://api.rewrite.so/...`，
  better-auth 在 api worker 处理完 verify 后 302 redirect 到 callbackURL（web origin）。
- **Cookie domain 必须是 `.rewrite.so`（生产）**：让 api 设的 session cookie 被
  `rewrite.so` 子域共享。`lib/auth.ts` 用 `crossSubDomainCookies: { enabled: true, domain: '.rewrite.so' }`
  仅当 baseURL 含 rewrite.so 时启用（dev localhost 不能这么设）。前端 `LoginClient` 传
  `callbackURL: \`${window.location.origin}/settings\`` 让 verify 后跳回 web origin，
  此时 cookie 已落在 .rewrite.so 上，web 端读得到。
- **Creem webhook 路径必须是 `/webhooks/creem`** 而不是 `/api/...`：避免 OpenNext path 重写。

## 配额与计费

- **配额按 UTC 自然月聚合**：表 `usage_monthly`，主键含 `month_utc='YYYY-MM'`。Token bucket（DO）只做秒级反爆刷，与月配额逻辑分离。
- **配额数字（10/5/30/2000）改动需重算成本**：当前售价（月付 $13.99 / 年付 $7.99/月，即 $95.88/年）下 Pro 跑满约 $4/月，留 $4-10 利润。匿名/扩展/登录免费档不应放宽至单用户成本超 $0.20/月。
- **BYOK 用户走 token bucket（100 req/min 反代滥用底线）但不查月配额**：防止当作我们 SSE 的反代。
- **installId 永不重置**：包括登录后；登录会做 `usage_monthly` 一次性 merge。
- **resolveUserTier 是订阅 → 配额档位的唯一入口**：`/v1/rewrite` 和 `/v1/me/usage` 都通过它查 subscriptions
  表决定 free/pro。`status` 为 `active|trialing|paused`，或 `canceled` 但 `current_period_end > now`，
  都返回 'pro'。其它（包括 `expired|past_due`）返回 'free'。webhook 状态机和这个查询逻辑必须一致。
- **Webhook 路径 `/webhooks/creem`**：Creem 用 header `creem-signature` 传 hex 编码的 HMAC-SHA256，
  必须用原始 `c.req.text()` 做签名校验（JSON.parse 后再 stringify 会丢空白导致签名对不上）。
  幂等用 `webhook_events` 表的 `event_id` PK，先查 → 处理 → 写。
- **Creem test mode 走 `https://test-api.creem.io`，生产走 `https://api.creem.io`**：
  `creem.ts` 的 `creemBase(apiKey)` 按 key 前缀自动路由（`creem_test_*` → test，`creem_*` → live）。
  写错 base URL 会一律 401 invalid key（test key 在 live endpoint 上无效）。
- **BYOK 仅 Pro 用户可配（在 PUT 路径校验）**：但 /v1/rewrite 在执行时只看 byok_keys 表是否有行，
  不再二次校验订阅——避免订阅过期后用户的 BYOK 突然失效。订阅过期时若想强制回退，
  应在 webhook subscription.expired 处理器里清掉 byok_keys。MVP 不做。
- **BYOK_MASTER_KEY 是 base64 编码的 32 字节 AES-GCM key**（`openssl rand -base64 32` 生成）。
  改 master key 会让所有 byok_keys 失效。`key_version` 字段保留给将来多 key 轮换用，MVP v=1。

## 前端实现要点

- **content script 不要引入 React/Vue 等框架**：`packages/core` 浮层 UI 用纯 vanilla DOM，bundle gzip < 30KB。扩展自己的 popup/options 才用 Preact。
- **React 受控 input 替换值**：不能 `el.value = x`，必须用 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` 调 prototype setter，否则 React 不感知。
- **contenteditable 替换**：先 `dispatchEvent(InputEvent('beforeinput', { inputType: 'insertReplacementText', data }))`，被框架（ProseMirror/Lexical/Slate）preventDefault 后我们就不要再写 DOM；否则降级到 `document.execCommand('insertText')`（已废弃但唯一保留 undo 栈）。
- **chrome.storage 所有 key 带 `_v: 1`**：方便将来跨版本兼容时新字段读旧值。MVP 不写迁移层但保留版本字段习惯。

## 基础设施

- **Cloudflare Workers Paid plan（$5/月）必须**：Free 不支持 Durable Objects，且 CPU > 10ms 会被切。这是开发前置假设。
- **OpenNext 部署目标是 Workers，不是 Pages**：2025 起 Pages 进入维护，新功能只进 Workers Static Assets。`wrangler.toml` 中 `assets.directory = ".open-next/assets"`。
- **DO 名字 `ip:<sha256(ip + daily_salt)>`**：salt 每天轮换，避免 IP 跨天关联（GDPR 风险）。

## CI/CD（GitHub Actions）

- **path filter 触发**：`deploy-api` / `deploy-web` 只在 push main 且 `apps/api/**`、
  `apps/web/**`、`packages/**`、`pnpm-lock.yaml` 改动时跑。改 docs / extension /
  workflow 自身**不会**触发部署。
- **D1 migrations 自动跑**：`deploy-api.yml` 在 deploy 之前自动跑
  `wrangler d1 migrations apply rewrite-so --remote`。wrangler 用 `d1_migrations`
  表追踪已应用版本，幂等：已应用的跳过、新加的按文件名顺序执行。
  - 文件名严格 `NNNN_xxx.sql`（4 位数字 + 下划线 + 描述），按字典序应用
  - **不要修改已部署过的旧 migration**（已记录在 d1_migrations 表，wrangler 会跳过你的修改；
    如果 schema 错了，新增 `0002_fix_*.sql` 来纠正）
  - 紧急人工干预走 `migrate-d1.yml` workflow_dispatch（指定 file 跑特定 SQL，
    或 target=local-dry-run 试运行）
  - `wrangler.toml` 的 `[[d1_databases]]` 配 `migrations_dir = "src/db/migrations"`，
    不要改
- **release 扩展**：tag 必须 `ext-v*` 前缀（如 `ext-v0.1.0`），其它 tag 不会触发。
  zip artifact 同时上传到 Actions artifacts 和 GitHub Release，方便不发布也能拿到
  打包结果。
- **secrets**：CI 不会自动同步 wrangler secrets（如 OPENAI_API_KEY、
  BETTER_AUTH_SECRET）；改 secret 时手动 `wrangler secret put` 或在 dashboard 改。

## Web build 时的 env 烘焙

- **`next.config.mjs` 的 rewrites destination 是 build-time 烘焙**：`process.env.API_BASE_URL`
  在 build 时读，destination 字符串被写进 `routes-manifest.json`。`wrangler.toml [vars]` 是
  runtime-only，**不影响 build**。GHA `deploy-web.yml` 的 OpenNext build step 必须显式
  `env: API_BASE_URL: https://api.rewrite.so`，否则 fallback 到 `http://localhost:8787`
  → prod 上 `/v1/*` 和 `/api/auth/*` 代理全部 500。
- **新增 build-time env 同样要在 deploy-web.yml 加 env block**（如 NEXT_PUBLIC_*）。

## 工具链坑位

- **wrangler dev 与系统代理冲突**：当用户机器有 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量时，worker 内 `fetch()` 会被强制走代理（即使是 localhost）。本地端到端调试 mock upstream 时必须先 `unset` 这些变量，或用 `env -u HTTP_PROXY ...` 启动。生产环境 Workers 没这个问题。
- **mock-upstream.mjs 必须 listen 在 `127.0.0.1` 而非默认 `0.0.0.0`**：避免 IPv6/IPv4 双栈解析在 wrangler workerd 里出现连接挂起。
- **CRXJS + pnpm monorepo 必备**：
  - `vite.config.ts` 中 `optimizeDeps.exclude` 必须排 workspace 包（`@rewrite/core` 等），否则首次冷启动 Vite 把 workspace 扁平化失败。
  - workspace 包名不能含 `.`（用 `@rewrite/core` 不要 `@rewrite/core.ext`）。
  - content script 入口必须是本地 host 文件（`apps/extension/src/content/index.ts`），不能直接引 workspace 包文件。
  - `resolve.alias` 中 `react → preact/compat` 仅给扩展自己的 popup/options 用，content script 不应引入框架。

## 已知不支持场景

不要被 "修一下就好" 的 PR 误导：

- **Google Docs**：canvas 渲染，无 DOM 输入框可注入。
- **Gmail compose**：iframe + 复杂 contenteditable，需重大架构变更。
- **MV3 service worker 30s 强 kill**：单次 SSE 一般 < 5s 不触边界；如果未来加长流式（如自定义 prompt 大输入）需重新评估。

## i18n（多语言）

- **UI locale ≠ content locale**：UI 文案语言走 `user_settings.ui_locale` /
  next-intl；改写目标语言走 `user_settings.target_lang` +
  `packages/core/src/lang/detect.ts`。两者**永不混用**——一个英国人也可能想把中文改写成
  中文（UI=en，content=zh）。
- **Catalog 单一来源**：`packages/shared/src/messages/{locale}.json` 是所有 UI 字符串的
  唯一来源；apps/web 直接 `import` 这些 JSON（包 exports 已暴露 `./messages/*.json`）。
  改文案只改一处。**不要**手编 `apps/web/messages/`（不存在）或扩展端的本地副本。
- **支持语言**：`en` / `zh-CN` / `ja` / `ko` / `es` / `fr` / `de`（共 7）。`StoredLocale`
  额外含 `'auto'`，仅用于 user_settings.ui_locale 的存储值（运行时由 resolveLocale 解析）。
- **`zh-TW` 当前归并到 `zh-CN`**：`pickLocale` 显式约定。**v0.2 复议触发条件**：
  ≥3 名繁体用户反馈差异强烈，则新加 `zh-TW.json` + 改 LOCALES 数组。
- **AI 翻译标记**：ja/ko/es/fr/de 由 LLM 翻译初稿，PR description 必须标 "AI-translated,
  awaiting native review"。`scripts/i18n-translate.ts`（待补）按 source-hash cache 幂等：
  改一个英文 key 不会触发整个文件重翻。
- **注册时 ui_locale 必须落 DB**：`apps/api/src/lib/auth.ts` 的 `databaseHooks.user.create.after`
  从请求 Accept-Language 推导 → `pickLocale` → INSERT user_settings。**不要**把 'auto' 当
  默认值——'auto' 是用户*显式*选择的"跟系统"标记。
- **邮件 locale fallback 顺序**：`user_settings.ui_locale` ≠ 'auto' → 用之；否则 'en'。
  dispatcher 在 cron Worker 里没 navigator 上下文，**不要**试图运行时 detect。
- **`localePrefix: 'as-needed'`**：默认 en 走根 `/`，其它带前缀 `/zh-CN/...`。修改
  `defaultLocale` 会影响 SEO 与 sitemap，慎重。
- **hreflang + sitemap 是 SEO 必需**：每页 layout 输出 7 个 `<link rel="alternate" hreflang>`
  + `x-default`；`apps/web/app/sitemap.ts` 输出含 `xhtml:link rel="alternate"`。
  新增 page 必须同步更新 `PUBLIC_PATHS` 列表。
- **`pnpm i18n:validate` 是 CI gate**：PR 改任何 messages JSON 都必须保证 7 个文件 key 集
  一致 + 叶子非空字符串，否则 CI 红。
- **next-intl `middleware.ts` 在 Next 16 已 deprecated（推荐改名 proxy.ts）**：当前
  `next-intl` 4.11 仍生成 middleware.ts 风格代码，警告但功能正常。等 next-intl 适配
  Next 16 的 proxy 命名后再改。

## 环境变量

`OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`（**无内置默认值**）/ `BYOK_MASTER_KEY` / `CREEM_*` / `RESEND_API_KEY` / `GOOGLE_OAUTH_*` / `TURNSTILE_*` / `BETTER_AUTH_*` / `NEXT_PUBLIC_SITE_ORIGIN`（i18n hreflang/sitemap 绝对 URL，默认 `https://rewrite.so`）。

详见 `.env.example`。
