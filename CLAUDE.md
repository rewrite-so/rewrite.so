# CLAUDE.md

本文件仅记录"未来 Claude 必须知道、且无法从代码或 git log 推导"的项目约定。
代码自解释的内容（目录结构、文件清单、API 列表、`package.json scripts` 命令）一律不写在这里——它们在 README 或代码本身。

## 产品契约（不可静默更改）

- **3 风格契约**：固定为 `faithful / casual / formal`（中文标签：贴近原文 / 口语 / 正式）。修改 `packages/prompts` 后必须人工 sample ≥5 组中/英输入，确认 3 种风格差异未塌陷。自动测试无法保证语义差异。
- **选区改写 prompt 区分**：`buildMessages` 在 `hasSelection=true` 且有 context 时
  走 SELECTION/CONTEXT 双区块结构（明确告诉 LLM "DO NOT rewrite context, output ONLY
  the rewritten selection"）。修改这部分**同样必须人工 sample**：长文本选段改写场景
  下 LLM 是否真的只输出选段、是否过度采纳 context 内容。
- **触发去抖窗口 500ms**：误触和延迟的权衡值，不要随意调。
- **候选数固定 3，不能加第 4 个**（产品决策）。
- **regen 算 1 次配额**：浮窗每张卡的 ↻ Regenerate / Retry 触发独立 `POST /v1/rewrite styles=[N]`，
  与首发请求按相同口径扣月配额（`apps/api/src/routes/rewrite.ts` 的 `checkAndIncrement`）。
  不要给 regen 加"重试不计费"豁免——每次都是真实 LLM cost，且会被滥用为无限调。
  API contract `RewriteRequestSchema.styles` 因此放宽到 `min(1).max(3)`。
- **不加自定义 prompt 输入框**（产品决策；BYOK 仅替换 endpoint，不让用户改 prompt）。
- **自定义 targetLang 例外**：`/settings` 允许任意自然语言描述（"粤语" / "British English" /
  "Shakespearean"），通过 `lib/sanitize-target-lang.ts` 注入到 prompt。这是有意松绑——
  `targetLang` 是 prompt 模板里的具名 slot，不是 prompt 自定义；与 BYOK 的"信任已登录用户"
  哲学一致。**sanitize 是 hard requirement**（防引号/控制字符跳出 string literal）。
  **不要扩大到 style / candidate 数 / 完整 prompt** —— 那些仍是契约固定。`/try` 不开放
  custom（匿名快速试用 UX 简洁）。
- **目标语言默认"自动检测页面语言"**：用户在 onboarding/设置中可改为固定语言。临时覆盖（每次切换）MVP 不做。
- **扩展不在 rewrite.so 自家域工作**：扩展 `inject.ts` 的 `exclude_matches` 列上
  `https://rewrite.so/*` / `https://*.rewrite.so/*` / `http://localhost:3000/*` /
  `http://127.0.0.1:3000/*`。/try 永远走 web 自带的 `mount()`，无论用户是否装扩展——
  `/try` 是给"还没装扩展的人"的演示页，已装扩展的人本来就不需要去演示。
  
  设置类页面（/settings, /billing 等）的输入框是配置字段，不应被双击 Shift 改写功能
  误触发，扩展不工作反而合理。
  
  **历史曲折**（524a3af → f2c8534 → bd6e032 → 最终方案）：曾尝试"扩展接管 +
  sentinel.ts 让 web 跳过 mount"的复杂协作，结果反复出问题（双方都不跑 / OpenNext
  渲染冲突 / 设计复杂度爆炸）。最终回到最简方案：**扩展明确不在自家域工作**。
  
  新加自家域（如 docs.rewrite.so）只需同步加到 inject.ts 的 `exclude_matches`。
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
- **Webhook 延迟旁路 = `POST /v1/billing/verify-checkout`**：用户从 Creem 跳回
  `/settings?billing=ok&checkout_id=xxx` 时 SettingsClient 主动调，让我们这边查一次
  Creem checkout 直接落库，不等 webhook（可能延迟数秒到分钟级）。webhook 仍发，靠
  `creem_subscription_id` PK 幂等。**严格校验 metadata.user_id == session.user.id**
  防伪造 checkout_id 把别人订阅落到自己名下。webhook.ts 的 upsertSubscriptionFromObject
  是公用 helper（webhook 路由 + verify 端点都用）。
- **浮窗状态信息（auth/tier/usage/byok）有两条传输路径**：
  - 200 OK 路径：SSE meta event 的 `status` 字段（authed/tier/isBYOK/used/limit）→ 客户端
    `panel.setStatus()` 决定 BYOK badge / quota chip / signin footer 显示。
  - 4xx 路径（quota_exceeded 等不进 muxToSSE）：response body 直接带 `authed/tier`，
    客户端 `setGlobalError(code, detail)` 的 detail 拿来决定 CTA（登录用户 → "Configure
    BYOK or upgrade"，匿名 → "Sign in for more"）。
  扩展路径要在 `service-worker.ts` 解析 4xx body JSON 后通过 port-protocol 显式
  forward `authed/tier/used/limit/resetAt`——`message` 字段是字符串切片，不会被自动
  parse。**新增 4xx 透传字段时三处都要加**：`port-protocol.ts` FromBackground 类型、
  `service-worker.ts` 的 extras 解析、`port-client.ts` 的 detailObj 重建。
  避免再起额外请求（如 `/v1/me`）来拿这些状态——0 额外网络往返。
- **上游协议严格 OpenAI Chat Completions SSE**：仅认 `choices[0].delta.content`，不为 vendor 自创字段做兼容层。BYOK 用户用其它 vendor 自担兼容性。
- **平台默认 upstream = DeepSeek V4-Flash + thinking disabled**：`apps/api/src/routes/rewrite.ts`
  平台路径通过 `UpstreamConfig.extraBody` 注入 `{ thinking: { type: 'disabled' } }`。原因：
  V4-Flash 默认 thinking enabled，思考链通过 SSE delta 的 `reasoning_content` 单独返回——
  `upstream.ts` 只读 `content` 不会污染输出，但 reasoning token 计费 + 首字延迟 +1-3s，改写
  场景不需要。**BYOK 路径不注入**（用户可能配 OpenAI / Anthropic / 其它 vendor，强塞
  deepseek-only 字段会破坏兼容性）。`UpstreamConfig.extraBody` 在 body spread 时**置前**，
  确保不会覆盖核心 4 字段（model / messages / stream / temperature）。变量名仍叫
  `OPENAI_*` 是因为表达的是协议族不是 vendor。
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
- **installId 永不重置 + 登录后 install 配额合并**：扩展 inject.ts bootstrap 时若已登录调
  一次 `POST /v1/me/claim-install`，把当月 `('install', installId)` 维度的 count 加到
  `('user', userId)` 维度。靠 `usage_claims` 表 PK (user_id, source_kind, source_id,
  month_utc) 幂等——重复调用 no-op。**只 merge install 一种 source**：IP 跨网络/跨日轮换
  salt 没稳定标识，merge 价值低。Web 注册（无 installId）走的人不需要 merge。
  没这步的话匿名用 5/5 → 注册 → 拿到全新 30/30，是绕匿名档的滥用通道。
- **扩展 prefs 跨端同步策略**：登录用户的 web → extension chrome.storage 同步**只有两条路径**：
  - **inject.ts bootstrap `fetchCloudPrefs()`**（主动 pull）：每个支持页加载时拉一次。
    对未做 rewrite 的新打开 tab 是唯一同步源。
  - **SSE meta `userTargetLang`** via `onUserPrefsSync` callback（rewrite 副产物 push）：
    用户做 rewrite 时服务端把 user_settings.target_lang 原始值（含 'auto'）echo 回。
  
  **没有第三条**——options App.tsx 自 d9cf3e9 不再做 fetchCloudPrefs（避免和 web 编辑
  时序错位造成"看起来不一致"）。`patchCloudPrefs` 现仅在匿名 patchUserPrefs 路径
  triggers（401 静默无副作用），保留以便未来快捷入口复用。
  
  **不要在扩展 chrome.storage 里加敏感字段**——storage 镜像逻辑只针对
  `targetLang` / `uiLocale` 子集。
- **扩展 options 是 auth-aware split**（避免 web ↔ extension 显示不一致）：
  - 登录用户的 options 仅展示 triggerEnabled + "在 rewrite.so 管理偏好 →" 链接，
    **不渲染** targetLang/uiLocale 编辑控件——chrome.storage 副本仍存在（SSE meta
    实时同步给 inject.ts），但用户看不到副本即"看不到不一致"。
  - 匿名用户的 options 保留完整本地表单（`targetLang`/`uiLocale`/`triggerEnabled`/
    BYOK 占位）。
  - 登录态探测：options App.tsx 启动时 `fetchMe()` via SW → GET `/v1/me`。
  - **不要把 LoggedInSettings 重新加回 targetLang/uiLocale 控件** —— 那是回到不一致
    问题的根源；要想跨设备同步给"未做 rewrite"的用户看，唯一正解仍然是 web /settings。
  - 反向 SSE meta `userTargetLang` 同步路径（`onUserPrefsSync`）保留并仍是
    inject.ts 浮窗 UI 显示正确语言的关键。
- **实时反向同步 = SSE meta.status.userTargetLang**：服务端 `/v1/rewrite` 在 status
  里带 user_settings.target_lang 原始值（含 'auto'）。扩展 inject.ts 通过 mount() 的
  `onUserPrefsSync` callback 写回 chrome.storage（仅当与 cache 不同；避免无限循环）。
  这是 visibilitychange + 30s 节流的轻量补充：用户改完语言下一次改写就立即跨端同步，
  0 额外网络往返。匿名用户不带这字段，跳过同步。
- **resolveUserTier 是订阅 → 配额档位的唯一入口**：`/v1/rewrite` 和 `/v1/me/usage` 都通过它查 subscriptions
  表决定 free/pro。`status` 为 `active|trialing|paused`，或 `canceled` 但 `current_period_end > now`，
  都返回 'pro'。其它（包括 `expired|past_due`）返回 'free'。webhook 状态机和这个查询逻辑必须一致。
- **Webhook 路径 `/webhooks/creem`**：Creem 用 header `creem-signature` 传 hex 编码的 HMAC-SHA256，
  必须用原始 `c.req.text()` 做签名校验（JSON.parse 后再 stringify 会丢空白导致签名对不上）。
  幂等用 `webhook_events` 表的 `event_id` PK，先查 → 处理 → 写。
- **Creem test mode 走 `https://test-api.creem.io`，生产走 `https://api.creem.io`**：
  `creem.ts` 的 `creemBase(apiKey)` 按 key 前缀自动路由（`creem_test_*` → test，`creem_*` → live）。
  写错 base URL 会一律 401 invalid key（test key 在 live endpoint 上无效）。
- **BYOK 任何登录用户均可配**：`PUT /v1/me/byok` 仅校验 `session`，不再要求 Pro 订阅。
  产品决策：BYOK 不再是 Pro 专属，Pro 的差异化是 hosted model（2000/月）+ 不用管 key
  + Priority。`/v1/rewrite` 仍只看 byok_keys 表存在 —— Pro 订阅过期时 BYOK 仍生效
  （避免突然失效）。反代滥用底线仍是 BYOK 用户走 100 req/min token bucket（不变）。
- **BYOK 测试 endpoint** `POST /v1/me/byok/test`：用户保存前验证 baseUrl/model/apiKey
  能否调通上游。**不存 DB**、**不写日志**、**不计配额**（key 是用户的，绝不落地）。
  8s timeout，错误码映射：401→unauthorized / 403→forbidden / 404→model_not_found /
  429→rate_limited / AbortError→timeout / 其它 throw→unreachable。仅登录用户可调
  （防匿名滥用作 base URL 探测）。
- **BYOK_MASTER_KEY 是 base64 编码的 32 字节 AES-GCM key**（`openssl rand -base64 32` 生成）。
  改 master key 会让所有 byok_keys 失效。`key_version` 字段保留给将来多 key 轮换用，MVP v=1。

## 前端实现要点

- **content script 不要引入 React/Vue 等框架**：`packages/core` 浮层 UI 用纯 vanilla DOM，bundle gzip < 30KB。扩展自己的 popup/options 才用 Preact。
- **React 受控 input 替换值**：不能 `el.value = x`，必须用 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` 调 prototype setter，否则 React 不感知。
- **浮层 button mousedown 必须 preventDefault**：浮层内任何 `<button>`（齿轮 / ↻ / Retry）
  mousedown 默认会把焦点从原输入框转移到 button，触发输入框 focusout → activeEditable
  变 null → onSelect 静默失败 / contenteditable 拒绝写入。`packages/core/src/ui/candidates.ts`
  panel 容器统一 `mousedown preventDefault`（不阻止 click 触发）。同时 mount() 用
  `lockedEditable` 锁定浮层期间的 target，即使焦点真丢了也能 `.focus()` 回来。
  新增 button 时不需要单独处理，panel 容器级 listener 已覆盖。
- **contenteditable 替换**：先 `dispatchEvent(InputEvent('beforeinput', { inputType: 'insertReplacementText', data }))`，被框架（ProseMirror/Lexical/Slate）preventDefault 后我们就不要再写 DOM；否则降级到 `document.execCommand('insertText')`（已废弃但唯一保留 undo 栈）。
- **chrome.storage 所有 key 带 `_v: 1`**：方便将来跨版本兼容时新字段读旧值。MVP 不写迁移层但保留版本字段习惯。

## 基础设施

- **扩展身份信任 = `EXTENSION_ALLOWED_ORIGINS` 白名单**（`apps/api/src/lib/extension-origin.ts`）：
  生产 API 仅信任白名单里的 `chrome-extension://<id>` origin 发起的扩展请求；不在白名单
  → 403 invalid_client（`apps/api/src/routes/rewrite.ts` 的 `isExtensionRewriteRequest`）。
  本地 wrangler dev 走 isLocalApi 路径放行任意扩展 origin（unpacked 调试用）。
  
  **本地 unpacked 装的扩展打到生产 API 必须有稳定 ID**：`apps/extension/src/manifest.config.ts`
  在非 store 构建时注入 `DEV_PUBLIC_KEY`（私钥见 `apps/extension/.dev-keys/dev.pem`，
  gitignore），固定本地 unpacked ID = `nfjhbfpolpfddniebgjnfpmndpcpaadg`，已在
  `EXTENSION_ALLOWED_ORIGINS` 中与 store ID 共存。
  
  **Store 上架构建必须置 `EXT_STORE_BUILD=1`**：跳过 manifest.key 注入，让 Chrome Web
  Store 沿用其分配的 publisher key（保留现有 ID `gheiendipgcgiligfmbimbbffkkfiamk`）。
  release workflow `.github/workflows/release-extension.yml` 已配置该 env，正常 `ext-v*`
  tag 触发的发布走 CI 是安全的。**手动上架场景**（如绕开 CI 直接拖 zip 到 store
  console）必须本地显式 `EXT_STORE_BUILD=1 pnpm --filter @rewrite/extension package`。
  漏设会让带 dev key 的 zip 被 store 拒收（"Manifest key does not match existing item"），
  不会覆盖线上版，但需要删 release/重跑修复。
  
  新增协作者要本地测试需各自生成 dev key + 把 ID 加到 `EXTENSION_ALLOWED_ORIGINS`，
  或共享同一份 dev key（私钥须经安全渠道传递，不入仓库）。
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
- **`apps/web` dev 用 `next dev --webpack`，不用 Turbopack**：landing 页用 CSS Modules
  + `<Image>` 背景；Turbopack 在 Next 16 早期版本对某些 CSS Modules 边界（含字体加载或
  `background-image` URL 重写）偶发 layout 错位 / class hash 不稳。webpack 启动慢但
  渲染稳定。等 Turbopack 在 Next 16.x 稳定后再换。production `next build` 不受影响。
- **`<html suppressHydrationWarning>` + `<body suppressHydrationWarning>` 是有意为之**：
  浏览器扩展（1Password / Grammarly / 深色模式切换器 / 翻译插件）会在 SSR HTML 到达后
  注入 `data-*` / class 到 `<html>` 或 `<body>`，触发 React hydration mismatch 警告。
  `suppressHydrationWarning` 仅抑制这些**属性级别**警告，**不会**掩盖 React 树内部
  真实的 hydration bug（后者照样报）。不要因"看着像调试障眼法"就移除。

## D1 migrations 编号区间约定

为支持闭源 admin worker（rewrite-so/admin private repo）独立演进 schema，D1
migration 文件名编号空间按仓库分治：

- **本仓库 `apps/api/src/db/migrations/`**：`0001 ~ 7999`
- **闭源 admin 仓库 `apps/admin/src/db/migrations/`**：`8000 ~ 9999`

两边各自跑 `wrangler d1 migrations apply rewrite-so --remote`，wrangler 用
`d1_migrations` 表按文件名幂等去重，已应用的跳过，新加的按字典序执行。

**严禁**：
- 在本仓库新加 migration ≥ 8000（会与 admin 仓库的 migration 冲突）
- 修改已部署过的 migration（已记录在 `d1_migrations` 表，wrangler 会跳过你的修改；
  schema 错了请新增 `00NN_fix_*.sql` 纠正）

**业务表（`users` / `subscriptions` / `usage_monthly` / `byok_keys` /
`user_settings` / `user_email_state`）字段变更须在 PR 描述里明确通知 admin
维护者**——admin worker 直接读这些表，主仓库改字段会让 admin 看板/写操作崩。
同步通知机制是非自动化的，靠 review 纪律。

详见 `docs/admin-rollout-plan.md`。

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

`OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`（代码无内置默认 fallback——三个变量缺一就 503；文档推荐默认值 `https://api.deepseek.com/v1` + `deepseek-v4-flash`）/ `BYOK_MASTER_KEY` / `CREEM_*` / `RESEND_API_KEY` / `GOOGLE_OAUTH_*` / `TURNSTILE_*` / `BETTER_AUTH_*` / `NEXT_PUBLIC_SITE_ORIGIN`（i18n hreflang/sitemap 绝对 URL，默认 `https://rewrite.so`）。

详见 `.env.example`。
