# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
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
  - 修了 /try "This page couldn't load" 错误（扩展 inject 在 OpenNext SSR 边界引发的渲染冲突）
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
