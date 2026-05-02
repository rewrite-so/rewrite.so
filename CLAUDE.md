# CLAUDE.md

本文件仅记录"未来 Claude 必须知道、且无法从代码或 git log 推导"的项目约定。
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
- **Magic Link 邮件链接的 host 必须是 web origin（不是 api origin）**：
  better-auth 默认生成 `${baseURL}/api/auth/magic-link/verify?...`（baseURL = api origin）。
  如果用户在邮件里点这个链接，cookie 会落在 api origin (8787 / api.rewrite.so) 上，
  web 端 (3000 / rewrite.so) 拿不到。`lib/auth.ts` 的 sendMagicLink 把 url 的 host
  替换成 `WEB_ORIGIN`；前端调用 `/api/auth/sign-in/magic-link` 时 callbackURL 也用绝对 URL
  指向 web origin。Web 端通过 next rewrites 代理 `/api/auth/*` 到 wrangler，
  Set-Cookie 透传后落在 web origin（dev: localhost；prod: rewrite.so）。才能携带 cookie；content script 直接 fetch 拿不到。
- **Creem webhook 路径必须是 `/webhooks/creem`** 而不是 `/api/...`：避免 OpenNext path 重写。

## 配额与计费

- **配额按 UTC 自然月聚合**：表 `usage_monthly`，主键含 `month_utc='YYYY-MM'`。Token bucket（DO）只做秒级反爆刷，与月配额逻辑分离。
- **配额数字（10/5/30/2000）改动需重算成本**：当前售价（月付 $13.99 / 年付 $8/月，即 $96/年）下 Pro 跑满约 $4/月，留 $4-9 利润。匿名/扩展/登录免费档不应放宽至单用户成本超 $0.20/月。
- **BYOK 用户走 token bucket（100 req/min 反代滥用底线）但不查月配额**：防止当作我们 SSE 的反代。
- **installId 永不重置**：包括登录后；登录会做 `usage_monthly` 一次性 merge。

## 前端实现要点

- **content script 不要引入 React/Vue 等框架**：`packages/core` 浮层 UI 用纯 vanilla DOM，bundle gzip < 30KB。扩展自己的 popup/options 才用 Preact。
- **React 受控 input 替换值**：不能 `el.value = x`，必须用 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` 调 prototype setter，否则 React 不感知。
- **contenteditable 替换**：先 `dispatchEvent(InputEvent('beforeinput', { inputType: 'insertReplacementText', data }))`，被框架（ProseMirror/Lexical/Slate）preventDefault 后我们就不要再写 DOM；否则降级到 `document.execCommand('insertText')`（已废弃但唯一保留 undo 栈）。
- **chrome.storage 所有 key 带 `_v: 1`**：方便将来跨版本兼容时新字段读旧值。MVP 不写迁移层但保留版本字段习惯。

## 基础设施

- **Cloudflare Workers Paid plan（$5/月）必须**：Free 不支持 Durable Objects，且 CPU > 10ms 会被切。这是开发前置假设。
- **OpenNext 部署目标是 Workers，不是 Pages**：2025 起 Pages 进入维护，新功能只进 Workers Static Assets。`wrangler.toml` 中 `assets.directory = ".open-next/assets"`。
- **DO 名字 `ip:<sha256(ip + daily_salt)>`**：salt 每天轮换，避免 IP 跨天关联（GDPR 风险）。

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

## 环境变量

`OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`（**无内置默认值**）/ `BYOK_MASTER_KEY` / `CREEM_*` / `RESEND_API_KEY` / `GOOGLE_OAUTH_*` / `TURNSTILE_*` / `BETTER_AUTH_*`。

详见 `.env.example`。
