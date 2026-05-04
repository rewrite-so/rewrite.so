# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **/try 完成改写后转化 nudge**（来自战略 review 的 WS1 — 当前最大转化断点）：
  - 用户接受候选后 textarea 下方 inline 显示 "✓ N rewrites done. Sign in for 30/month →"
  - 计数持久化到 localStorage `__rewrite_so_try_rewrites_v1`，跨 session 累积
  - 已登录用户不显示（启动时 probe `/v1/me`）；authed 用三态 null/true/false
    避免登录用户在 fetch 期间闪现 nudge
  - 不打断键盘流畅 + 不带 dismiss 按钮（信息型而非打扰型）
  - `mount()` MountOptions 加 `onAccepted` 可选 callback；扩展端不实现也 OK
    （扩展用户已过 anonymous 阶段）。**不传 finalText**——隐私契约禁止原文流入
    host telemetry
  - i18n: `page.try.nudge` + `page.try.nudgeCta` × 7 locale = 14 字符串，含
    ICU plural（en/es/fr/de 处理单复数；中日韩无 plural 形式可省）。
    379 → 381 keys
  - WS2 加 Plus 中间档（$4.99/mo, 200/月）讨论后**推迟**——MVP 阶段加 SKU 是
    技术债，没数据支持中间档需求，且 Plus 必然蚕食 Pro。先等用户量与反馈
- **设置 + Onboarding 反馈缺口打磨**（来自第四轮"梳理设置/onboarding 关系"分析的 G1/G3/G5）：
  - web /settings 顶部加一次性 WelcomeCard（蓝色，新登录用户引导，2 按钮：去 /try /
    安装扩展）。dismiss 后写 localStorage `__rewrite_so_settings_welcome_dismissed_v1`
    永久消失；老用户首次访问会看一次（接受这个 MVP 阶段意外）
  - web /settings Pro 升级成功后顶部显绿色 UpgradeBanner（"✓ Welcome to Pro! 你的
    2000 / 月配额已生效"）。基于 URL `?billing=ok` 触发，不依赖 verify-checkout 成功
    （庆祝支付事件本身），verify 失败时仍显示，webhook 异步兜底
  - 升级路径同时永久 dismiss WelcomeCard——避免用户 × 掉 banner 后又看到"new user
    引导"的视觉跳
  - 扩展 onboarding step 2 加 customHint 小字（select 下方）告知"更多选项（自定义
    方言、口音、风格）可在设置里配置"。不带链接（onboarding 时未登录会跳 /login
    干扰流程）
  - i18n: page.settings.welcomeCard.* (4) / page.settings.upgradeBanner.* (2) /
    ext.onboarding.step2.customHint (1) 共 7 keys × 7 locale = 49 字符串。dismiss ×
    按钮 aria-label 复用已有 `core.dismiss`。ja/ko/es/fr/de 是 LLM 初稿待母语校对
- **第三轮 review 修 5 处** — 隐私契约 + 运营 + UX：
  - **P0 修隐私契约违规**：扩展 service-worker.ts 的两处 console.info 删掉了用户访问的
    URL 和原文前 40 字（`port.sender?.url` / `msg.req.text.slice(0, 40)`）。即便是
    Chrome devtools 本地日志，用户截图分享时会暴露——违反 CLAUDE.md L44 "完全不
    记录原文"契约。改为只记 port name + `text.length`。
  - **P1 加 webhook miss reconcile cron**：每天 09:00 UTC 跑 `reconcileSubscriptions()`，
    扫 Creem 最近 48h 的 active subscriptions，对比 D1，缺的补落库（`creem_subscription_id`
    PK 幂等）。webhook 投递永久失败 / 用户跳回时关浏览器导致 verify-checkout 没跑的
    极端场景下兜底。新增 `apps/api/src/cron/reconcile.ts` + 4 条测试。
  - **P1 写灾难恢复 runbook**：`docs/disaster-recovery.md` 覆盖 deploy 回滚 / D1
    time-travel / schema 误改 / webhook miss 应急 / BYOK_MASTER_KEY 误改/泄露 5 个
    场景，含各业务表丢失影响等级表。
  - **P2 quota CTA 跳 /billing 不跳 /settings**：营销页直接列定价/Subscribe 按钮，
    转化路径最短。i18n key `core.cta.upgradeOrByok` → `core.cta.upgradePro`，
    7 locale 文案改 "Upgrade to Pro →"（原文案"配置 BYOK 或升级"在 /billing 页
    没 BYOK 表单是错位的）。BYOK 用户走齿轮入口 /settings 不变。
  - **P2 i18n 翻译状态文档**：`docs/i18n-status.md` 列 7 locale 各自 reviewer / 审阅状态。
    ja/ko/es/fr/de 是 LLM 初稿待母语校对，扩展 popup 上一轮加的 feedback 链接现在
    有正式入口跟踪反馈。
- **CR 跟进修 4 处**（同 commit 内）：
  - 修 SSE userTargetLang 反向同步会终止当前 SSE 流的 bug：inject.ts 的 onPrefsChanged
    现在仅对 triggerEnabled / uiLocale 变化做 unmount/remount；targetLang-only 变化
    静默更新 currentPrefs 不动 mount。stale cache 几秒没关系（服务端 user_settings
    是权威），比 abort 中流好得多
  - BillingClient successUrl 加 `{CHECKOUT_ID}` 占位符（Stripe-style 模板）+
    SettingsClient 加 UUID-shape 校验：Creem 替换则 verify 立即生效，不替换则
    literal 串被过滤，退化到纯 webhook 路径
  - upsertSubscriptionFromObject 改返 boolean：字段缺失静默 skip 时 verify 端点不再
    骗客户端 `applied: true`，让 SettingsClient 知道要等 webhook
  - claim-install 加 5 req/min/user token bucket：防脚本灌随机 installId 污染
    usage_claims 表（每用户每月理论只 1-2 次正常调用）
- **配额合并 install_id → user_id**（兑现 CLAUDE.md / migration 注释里写了但从未实现的承诺）：
  - 新表 `usage_claims (user_id, source_kind, source_id, month_utc, merged_count, claimed_at)`
    PK 防重放
  - `POST /v1/me/claim-install` 端点：把当月匿名 install 维度的 count 加到 user 维度
  - 扩展 inject.ts bootstrap 时若已登录就调一次（fail-soft）
  - 修了"匿名扩展用 5/5 → 注册 → 拿到全新 30/30"的滥用通道；服务端 PK 幂等，重复
    调用 no-op
- **Billing checkout verify 旁路**（webhook 延迟期间不再"看着还是 free"）：
  - `POST /v1/billing/verify-checkout` 主动 GET Creem checkout，幂等 upsert subscription
  - SettingsClient 在 `?billing=ok&checkout_id=xxx` 跳回时 await verify 后再 load /v1/me
  - 严格校验 `metadata.user_id == session.user.id` 防伪造 checkout_id 把别人订阅落到自己名下
  - webhook.ts 的 upsertSubscription 抽出 `upsertSubscriptionFromObject` 公用 helper
- **SSE meta.status 携带 userTargetLang 实时跨端同步**（不再 30s visibilitychange 节流）：
  - 服务端登录用户的 user_settings.target_lang 透传到 meta.status.userTargetLang
  - mount() 加 `onUserPrefsSync` callback；扩展 inject.ts 实现把它写回 chrome.storage
  - 用户在 web /settings 改语言后，下一次扩展改写就立即拿到（0 额外 RTT）
- **quota chip 两段式视觉**：>=50% 灰色提示，>=80% 加 .warn 琥珀色警告
- **popup 加 "Report wrong translation →" 链接**：mailto 预填 subject + locale + 扩展版本，
  收集 i18n 错译反馈渠道（之前没有）
- 浮窗状态信息显示 — auth/quota/BYOK 显式可见：
  - header 加 BYOK badge（仅 BYOK 模式）+ quota chip（used/limit > 80% 时琥珀色提示）
  - 未登录用户底部加 "Sign in for {N} rewrites / month →" footer（web 模式有 install
    hook 时不重复出现）
  - 超配额 CTA 按登录态分流：登录用户 → "Configure BYOK or upgrade"（跳 /settings），
    匿名用户 → "Sign in for more"（跳 /login）；之前所有用户都看 "Sign in for more" 即使
    已经登录，文案错位
  - SSE meta event 加 status 字段（authed/tier/isBYOK/used/limit）；服务端 rewrite.ts
    在 200 路径 emit 到 meta event，在 429 quota_exceeded 路径写入 4xx response body。
    后者关键：用户首次就 quota_exceeded（如 30/30 已用完）从未收到过 meta event，
    setGlobalError 只能从 4xx body detail 拿 authed 决定 CTA
  - decideCTA 文案改走 i18n（之前 zh/en hardcoded，其它 5 个 locale fallback 英文）
  - 扩展 port-protocol 透传 4xx body 字段（authed/tier/used/limit/resetAt）：原本
    bg 只 forward `{code, status, message}`，导致 detail.authed/used 这些信息在
    扩展路径全部丢失，只在 web 同源 fetch 路径生效。补这条传输链路才能让登录扩展
    用户看到正确的 "Configure BYOK or upgrade" CTA
  - 修单卡 regen 死循环：之前 ↻ Regenerate 触发 quota_exceeded 时，mount.ts 走
    `setError(style)` 显示卡级 Retry 按钮 → 用户点 Retry 又超配 → 死循环。改为
    可重试错误才走 setError，不可重试错误（quota_exceeded / unauthorized）升级到
    setGlobalError 让用户看到正确 CTA（Configure BYOK or upgrade / Sign in）。
    `isRetryableError` 从 candidates.ts export 给 mount.ts 复用
  - 修 setStatus 在 setGlobalError 后的 dead writes：global-error 时 panel.innerHTML=''
    会把 byokBadge / quotaChip / signinHintEl 全部 detach，加 globalErrored 标记防御
    后续 setStatus 在 detached 节点上空转
  - 工程量：rewrite.test +2、sse-frame.test +2、candidates.test +13（core 91→104 / api 212→214）
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
- 修浮窗 setGlobalError 没有 Retry 按钮的 bug —— "Upstream model error, please retry"
  文案让用户以为可重试，但浮窗只对 quota_exceeded / unauthorized 显示 CTA，对
  upstream_error / rate_limit / network / internal_error 等可重试错误返 null →
  用户卡死。修法：candidates.ts 加 `onRetryAll` callback + `isRetryableError()` helper；
  setGlobalError 在可重试错误码上显示 Retry 按钮（与 Sign-in CTA 可同时存在）；
  mount() 实现 retryAll：focus 回 lockedEditable + close + 重跑 handleTrigger。
  candidates.test.ts +5 用例，core 86 → 91。
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
- **Landing 重新定位** — Hero 从「隐私不存储」改为「随意写，自信发送」（outcome-led），
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
