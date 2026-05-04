# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- catalog 合并 `core.lang.{custom,customLabelFmt,customPlaceholder,customHelp}` ——
  原来扩展 `ext.options.langOption.custom*` + web `page.settings.lang.custom*` 两套
  完全相同的 4 keys × 7 locale 现在归一到 `core.lang.*` 一份。SettingsClient 加
  `useTranslations('core.lang')` 副 hook，extension Settings.tsx 用全路径 `t('core.lang.X')`。
  净 -28 字符串（删 56，加 28）。
- BYOK 解锁给所有登录用户 —— 不再是 Pro 专属：
  - `PUT /v1/me/byok` 删除 tier 校验，登录即可配
  - 商业划分调整为 Pro = hosted model（2000/月）+ Priority；Free + BYOK = 自带 key 无限
  - 产品决策合理性：能配 BYOK 的人本来就是技术用户，他们 OpenAI key 在手要么直接用 ChatGPT
    要么找别家工具——锁 Pro 反消费者。Cursor/Continue/Raycast 都是登录即 BYOK
- （CR follow-up）BYOK test endpoint 三处加固：
  - 加 rate limit `byokTest`（10 req/min/user，比生产 100 严格 10x）防 SSRF / DDoS
    amplification —— 用户能填任意 baseUrl 让 worker fetch，不限速时单账号可 burst 100 req
  - baseUrl zod refine 检测 `/chat/completions` 后缀，返回 `invalid_base_url` 而不是
    "model_not_found" 误导
  - me.test.ts 加 3 条测试覆盖新路径：rate_limit / invalid_base_url / timeout（用
    vi.useFakeTimers + AbortSignal）。API 测试 209 → 212
- BYOK Test 按钮 + `POST /v1/me/byok/test` endpoint —— 保存前验证连通性：
  - 8s 超时；错误码：unauthorized/forbidden/model_not_found/rate_limited/timeout/unreachable
  - 不存 DB / 不写日志 / 不计配额（key 是用户的，绝不落地）
  - Web UI BYOK 表单加 Test 按钮 + 4 状态机（idle/testing/ok/failed）；字段变更自动清掉
    陈旧测试结果防误导
- 文案 + 邮件 7 locale 同步更新：Pro 卡片改"hosted model, no setup"；Free 卡片加 feat7
  "BYOK option"；FAQ Q3 描述"任何登录用户都可配"；扩展 byok placeholder 改为
  "Configure on rewrite.so/settings"；邮件 Day 7 + Day 14 文案重写
- 测试：新建 `apps/api/src/routes/me.test.ts` 覆盖 PUT/DELETE/POST 共 13 用例（mock fetch
  + auth + crypto），api 总 196→209
- 浮窗 target chip 跟服务端 meta event 走（DB 是 SoT）—— 客户端 chrome.storage cache
  与 DB user_settings.target_lang 短暂不一致时，chip 收到 SSE meta event 后立即
  跳到服务端实际值，避免"chip 显示 EN 但改写出日文"的视觉错位。客户端 detect
  的本地预测仍作 fallback（meta 来之前显示，~150ms 后被服务端 echo 覆盖）。
- 扩展 ↔ web 偏好跨端同步 —— 用户在 web `/settings` 改 targetLang/uiLocale 现在能
  同步到扩展 chrome.storage，反之亦然：
  - `extension/lib/storage.ts` 加 `fetchCloudPrefs / patchCloudPrefs` helpers；
    `patchUserPrefs` 在写 chrome.storage 后 fail-soft 推送到 web `/v1/me/settings`
  - `extension/background/service-worker.ts` 加 `me-settings:get / patch` message handlers
    （content script 没 host_permissions 跨域 fetch）
  - `extension/content/inject.ts` bootstrap 和 `extension/options/App.tsx` 启动都
    先 `fetchCloudPrefs()` 拉云端覆盖本地 cache
  - 已登录用户：web ↔ 扩展双向同步；未登录：401 静默忽略，仅本地有效
- 浮窗 install hint 加 × 关闭按钮 —— 用户主动 dismiss 后 localStorage 记，不再
  显示。装扩展用户在 /try 不会反复看到「Install extension」。`core.dismiss` × 7 locale。
- 扩展 Options + Onboarding 接入 22 个目标语言 + Custom 自定义 —— 删除两个文件里
  各自的 LANG_LABELS 7 项硬编码，改用 `packages/shared` 的 `REWRITE_TARGETS` /
  `REWRITE_TARGET_LABELS`。Settings.tsx 加 Custom 输入框（同 web /settings 的逻辑）；
  Onboarding 同步扩到 22 预设（不暴露 Custom，新用户复杂度低）。
  扩展 i18n 加 `ext.options.langOption.{custom,customLabelFmt,customPlaceholder,customHelp}`。
  注：扩展端偏好与 web `/settings` 仍各自独立（chrome.storage.local vs user_settings 表），
  跨端同步是单独的 follow-up。
- **Landing 重新定位** — Hero 从「隐私不存储」改为「随手写，自信发」（outcome-led），
  五层金字塔：eyebrow / H1 / sub-h1（泛化痛点 "Stop overthinking every message"）/
  polyglot pill（"Any language in. Any language out."）/ intro。
- 新增「Sound familiar?」痛点-场景 section（Hero 后、How it works 前），4 行具体场景
  让用户对号入座（重打 Slack / 切到 ChatGPT 标签页 / 脑内翻译 / 反复读邮件）。
- Privacy Spotlight 保留但下移到 Features 之后（不再领跑 narrative，仍是 trust block）。
- Features 按"用户读到时的第一感"重排：keyboard / crossLang / byok / pii / stack /
  openSource（PII 移到 STACK 之前——直接价值优先）。
- How it works step 1/2 body 去 DOM / SSE 机制词；
  openSource feature title 从 "100% Apache 2.0" 改为 "Read the code yourself"。
- 新文案 7 locale 全部本地化（ja/ko/es/fr/de 由 LLM 翻译，待母语用户 review）。
- （补丁）「Sound familiar?」section 从 3 块扩为 5 块：增加 intro / bridge 过渡段
  + 4 行使用场景（外语学习 / 客户回信 / 公开发言 / 高焦虑沟通），重写 outro
  为"一个手势，三种打磨好的说法"，让 narrative 从"诊断（→ 灰）"过渡到"建议
  （✓ 绿）"再下接 How it works，治掉之前 hero → 痛点列表的突兀感。
- `/settings` + `/billing` 接入 next-intl，新增 `page.settings.*` + `page.billing.*`
  共 86 keys × 7 locale（约 600 字符串）。日期格式从硬写 `'en-US'` 改为按当前 locale
  渲染（`useFormatter`）。BYOK confirm dialog、subscription status、quota tier
  标签、plan toggle、checkout button 等全部本地化。ja/ko/es/fr/de 由 LLM 起草，
  待母语者 review。
- 改写目标语言下拉从 8 项扩到 22 项 —— 新增 `zh-TW` / `pt` / `it` / `ru` / `ar`
  / `hi` / `nl` / `pl` / `tr` / `vi` / `id` / `th` / `sv` / `da` / `he`，
  覆盖 OECD + 主要新兴市场。`packages/shared` 新增 `REWRITE_TARGETS` /
  `REWRITE_TARGET_LABELS` 作为单一来源，`/settings` 和 `/try` 两个下拉同步消费。
  注意：UI locale（界面语言）仍是 7 个，与改写目标语言完全独立。
- `/settings` 改写目标语言下拉新增「Custom...」项 —— 用户可输入任意自然语言
  描述（"Portuguese (Brazilian)" / "粤语正式书面" / "British English" /
  "Shakespearean English" 等），直接注入 prompt。API 端 max length 从 20 → 50，
  并加 sanitize（strip 引号 / 反斜杠 / 换行 / ASCII 控制字符）防 prompt 注入。
  /try 不开放 custom（保持匿名快速试用 UX 简洁）。
- （CR fixes）自定义 targetLang 打磨 — 选 Custom 后 input 自动聚焦；
  draft 留空离焦自动 reset 回 stored 值（修"UI 撒谎"bug）；
  sanitize 抽到 `lib/sanitize-target-lang.ts` 单独模块 + 14 条单元测试覆盖；
  GET /v1/me/settings 读路径加 lazy sanitize 兜底老脏数据；customHelp
  文案 7 locale 同步告知"特殊字符会被过滤"。
- 简化扩展 vs /try 协作策略 —— 扩展不在 rewrite.so 自家域工作：
  - 删除 sentinel.ts content script 整个文件
  - 扩展 manifest 的 inject.ts 用 `<all_urls>` + `exclude_matches` 排除 rewrite.so / *.rewrite.so / localhost:3000
  - TryClient 移除 extensionDetected 检测 + banner UI（永远走自己的 mount）
  - 删除 page.try.extensionTakeoverTitle / extensionTakeoverBody × 7 locale = 14 字符串
  - 顺带修了 /try "This page couldn't load" 错误（根因未单独定位，简化方案后症状消失，
    可能与扩展 inject 注入 rewrite.so 自身页面有关）
  - 历史曲折 524a3af → f2c8534 → bd6e032 → 最终回到最简方案
  - /try 是给"还没装扩展的人"的演示页；装了扩展的人本来就不需要去演示
- 修浮窗交互失效 bug —— 鼠标点卡片 / 齿轮 / ↻ Retry 都无反应：
  - 根因：浮层内 `<button>` 元素（齿轮 / ↻ / Retry）mousedown 时浏览器把焦点
    从输入框转移到 button → 输入框 focusout → activeEditable 变 null →
    onSelect 静默 return。contenteditable 框架（Lexical/Slate/ProseMirror）
    在已失焦时拒绝 replaceEditable 也加重表现。
  - 修法 A：panel 容器加 mousedown preventDefault —— 阻止 focus 转移
    （floating-ui / Tippy 标准做法）；click handler 仍正常触发
  - 修法 B：mount() 加 lockedEditable 在浮层期间锁定 target editable，
    onSelect 时如发现焦点已离开则 .focus() 回去再 replaceEditable
- 浮窗体验二轮打磨（用户反馈）：
  - 删除卡片副标题（"贴近原文 · 保留你原话的语气"等）—— 减少视觉拥挤；副标题对老用户冗余
  - 浮层右上角加 panel-header：始终显示 target lang chip + 齿轮 ⚙ 设置入口
    - chip 显示当前 target（短码 EN/ZH-CN 大写，自定义长文本截 11 字符 + …，hover 看完整）
    - 齿轮点击调 `MountOptions.onOpenSettings`：扩展端 → `chrome.runtime.openOptionsPage()`，
      web 端 → `window.open('/settings')`
  - 删除"zh → en"双语种 badge（用户反馈：始终显示当前 target 更直接）
  - 视觉打磨：panel padding 6→8、box-shadow 弱化、card-action 间距加大
- 浮窗体验包（5 项打磨）：
  - 风格 label 加副标题 —— `贴近原文 · 保留你原话的语气` / `口语 · 日常对话风` /
    `正式 · 商务书面感`，新用户一眼就明白 3 风格差别（`STYLE_SUBLABEL` × 7 locale）
  - regen 时保留旧内容 + opacity 0.45 + spinner 覆盖；首个 delta 来才清空——
    避免"啪一下消失"焦虑（resetCard 改"软重置"语义）
  - 首次使用底部 hint："1/2/3 accept · ↻ regen · Esc cancel" × 7 locale；
    localStorage 计数显示前 3 次后隐藏
  - 浮层右上角跨语言徽章 "zh → en"（仅 source ≠ target 时显示，使用 SSE meta event
    的 langDetected 字段，原"暂不渲染"注释解除）
  - **prompt 区分选区改写**：`buildMessages` 在 `hasSelection=true + context` 时
    走 SELECTION/CONTEXT 双区块强约束，明确 "DO NOT rewrite context, output ONLY
    the rewritten selection"。长邮件选段改写场景质量提升。CLAUDE.md 标注此处修改
    须人工 sample 验证
- 浮窗每张卡加 ↻ Regenerate / Retry 入口 — done 状态点击重生成单卡，error
  状态点 Retry 重试。`RewriteRequestSchema.styles` 放宽到 `min(1).max(3)` 支持
  单 style 请求。每次 regen 算 1 次配额（与首发口径一致）。`mount()` 的
  AbortController 拆为 `inflightAborts: Set<AbortController>`，per-request 独立
  abort，Esc / unmount / onSelect 仍 abort 全部。streaming 中按钮显示 spinner
  禁用（不允许同卡重叠 regen）。
- 修复扩展与 /try 双 mount 撞车 — 扩展 manifest 拆为两个 content script：
  rewrite.so 自家域只跑 `sentinel.ts`（document_start 给 `<html>` 设 data-attr），
  inject.ts 走 `<all_urls>` 但 exclude rewrite.so / localhost:3000。
  /try 的 TryClient 检测到扩展存在时跳过 mount + 隐藏 select + 顶部 banner
  说明"扩展已接管，目标语言去扩展弹窗改"。修了双 keydown listener / 双配额扣减 /
  双浮层重叠的 bug。

### Added
- **i18n** — 7 UI locales (`en` / `zh-CN` / `ja` / `ko` / `es` / `fr` / `de`) covering
  marketing pages, app pages (try / login / settings / unsubscribe), the in-page
  floating UI, and TopNav language switcher. URL strategy `localePrefix: 'as-needed'`
  (English at root, others at `/{locale}/...`).
- **i18n SEO** — `<link rel="alternate" hreflang>` × 7 + `x-default` per page;
  `apps/web/app/sitemap.ts` enumerates `pages × locales` with hreflang alternates.
- **i18n CI gate** — `scripts/i18n-validate.mjs` (`pnpm i18n:validate`) wired into
  CI; PRs with mismatched key sets across locales fail fast.
- **Auth hook** — better-auth `user.create.after` now writes `user_settings.ui_locale`
  from request `Accept-Language`, so first-time users get correct emails / popup
  language without falling back to `'auto'` at runtime.
- Cloudflare Web Store extension submission — _planned_

### Changed
- `apps/web/app/layout.tsx` is now `app/[locale]/layout.tsx`; all pages moved under
  `[locale]/`. The dynamic `generateMetadata` produces locale-aware title / description /
  hreflang alternates.
- `STYLE_LABEL` (faithful / casual / formal) extended from 2 to 7 locales.
- `Locale` type widened from `'en' | 'zh-CN'` to all 7; `StoredLocale = Locale | 'auto'`
  added for `user_settings.ui_locale` storage.

### Notes
- ja / ko / es / fr / de translations are AI-generated initial drafts, awaiting
  native review.
- Legal pages (terms / privacy / refund / aup) currently English-only; metadata
  titles are localized but body text is deferred (legal review needed).

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
