# rewrite.so

> 在任何网页输入框双击 Shift，立刻拿到 3 种风格的 AI 改写。

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

### 本地开发

```bash
pnpm dev:api      # Cloudflare Workers API（http://localhost:8787）
pnpm dev:web      # Next.js 网页（http://localhost:3000）
pnpm dev:ext      # Chrome 扩展（在 chrome://extensions 加载 apps/extension/dist 未打包）
```

### 检查与构建

```bash
pnpm typecheck    # 全 package TS 类型检查
pnpm test         # 全 package 测试
pnpm lint         # biome 检查
pnpm fix          # biome 自动修复
pnpm build        # 全 package 构建
```

### 部署

```bash
pnpm --filter @rewrite/api deploy
pnpm --filter @rewrite/web deploy
```

扩展通过 Chrome Web Store 发布；同时构建 zip 提供手动安装兜底（`pnpm --filter @rewrite/extension package`）。

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

## License

MIT
