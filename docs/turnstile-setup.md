# Turnstile 配置 Runbook

Cloudflare Turnstile 是给匿名 `/try` 用户做的反爬虫/反滥用挑战（invisible widget，
正常用户无感）。本文档说明端到端配置步骤。

> **架构定位**：Turnstile 是**可选**的——`TURNSTILE_SECRET` 不配置时服务端
> fail-open（`apps/api/src/lib/turnstile.ts` 第 19 行 `if (!secret) return true`），
> dev 不依赖 Cloudflare 账号。配上之后只挡匿名 web `/try`，不影响登录用户和扩展
> （`apps/api/src/routes/rewrite.ts` 第 102 行 `if (!userId && !req.installId)`）。

---

## 你需要的

- Cloudflare 账号（rewrite.so prod 部署用的同一个）
- 本地装好 `wrangler` CLI 并已 `wrangler login`
- GitHub repo 写权限（设 GitHub Actions vars）

---

## Prod 配置 5 步

### 1. 在 Cloudflare 创建 Turnstile site

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧 nav → **Turnstile**（如找不到搜索"Turnstile"）
3. 点 **Add Site**：
   - **Site name**: `rewrite.so`（任意识别名）
   - **Hostnames**: `rewrite.so`，可加 `localhost` 用于 dev 调试
   - **Widget mode**: **Invisible**（重要——TryClient.tsx 用的是 invisible challenge）
   - **Pre-clearance**: 关闭（默认）
4. 创建后会得到一对 keys：
   - **Site key**（公开值，前端用）→ `0x4AAA...`
   - **Secret key**（私密值，后端验签用）→ `0x4AAA...`

### 2. 把 secret 写进 API worker

```bash
cd apps/api
wrangler secret put TURNSTILE_SECRET
# 提示输入时粘贴上一步的 Secret key 全文
```

验证：`wrangler secret list` 应该看到 `TURNSTILE_SECRET`。

### 3. 把 site key 配到 GitHub Actions

不能 `wrangler secret`——这个值是**前端公开值**，必须 build time 烘焙进 web bundle
（CLAUDE.md "Web build 时的 env 烘焙" 段有说明）。

GitHub repo → Settings → Secrets and variables → Actions → Variables tab → **New variable**：
- Name: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- Value: 上一步的 Site key

`.github/workflows/deploy-web.yml` 第 50 行已经在 build env 里取这个 var：
```yaml
NEXT_PUBLIC_TURNSTILE_SITE_KEY: ${{ vars.NEXT_PUBLIC_TURNSTILE_SITE_KEY }}
```

### 4. 触发 deploy

```bash
git commit --allow-empty -m "chore: trigger deploy with turnstile config"
git push
```

或者改任何 `apps/web/**` 文件触发。CI 会用新的 site key 重 build web。

### 5. 验证生效

打开 https://rewrite.so/try（无痕窗口确保未登录）：

```bash
# 1) 浏览器 devtools → Network 标签，过滤 "challenges.cloudflare.com"
#    用户首次双击 Shift 应该看到 turnstile/v0/api.js + siteverify 请求
# 2) 改写一次正常完成 = invisible challenge 通过
# 3) curl 测试 fail 路径：
curl -X POST https://api.rewrite.so/v1/rewrite \
  -H 'content-type: application/json' \
  -d '{"text":"hi","hasSelection":false,"lang":"en","styles":["faithful","casual","formal"]}'
# 应该返回 403 {"error":"turnstile_failed"} —— 因为 anonymous 调用没带 token
```

如果第 3 步返回 200 而不是 403，secret 没生效——回 step 2 重新 `wrangler secret put`。

---

## Dev 本地调试

### 选项 A: 不配置（默认）

`TURNSTILE_SECRET` 不设 → API fail-open，本地 wrangler dev 跑得起来不需要 Cloudflare 账号。
扩展 + 登录用户路径不变；匿名 `/try` 也直接通过（dev 友好）。

### 选项 B: 用 Cloudflare 官方 dev 测试 keys

如果你想本地测 turnstile UI 流程（widget 加载、token 取号、verify 调用），用
[Cloudflare 官方 test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)：

```bash
# .env / wrangler dev 环境
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000BB
```

行为：
- `1x00000000000000000000BB` (sitekey) + `1x0000000000000000000000000000000AA` (secret)
  = invisible widget **always passes** → token 任意，verify 一直返 success=true
- `2x00000000000000000000BB` (sitekey) + `2x0000000000000000000000000000000AA` (secret)
  = invisible widget **always fails** → 模拟 challenge 失败，浮窗显示
  `turnstile_failed` 错误（手动验证 fail UX）

切换 sitekey/secret 后重启 wrangler dev + Next dev server 才能 build env 重新烘焙。

---

## 常见排查

### 浮窗弹出 "turnstile_failed"

- **DevTools Network**：`siteverify` 请求 response body 是什么？`error-codes` 字段会告诉你具体原因
  （sitekey 域名不匹配 / 域名 hostname 没加到 CF dashboard / 等）
- **CF dashboard → Turnstile → Site → Analytics**：看 challenge 失败率，正常 < 1%
- **/try 多次双击 Shift 触发 timeout（10s）**：可能 invisible challenge 被某些 ad blocker
  / corporate proxy 拦截，浏览器 console 看 `challenges.cloudflare.com` 的请求是否被 block

### "secret 配了但匿名仍能改写"

可能 build time `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 没烘焙进——前端 widget 没 render，
所以请求里没 token，但服务端 `TURNSTILE_SECRET` 配了，应该返 403。如果仍 200：

```bash
# 检查 worker 的 secret 是否真存在
wrangler secret list --name rewrite-api | grep TURNSTILE
```

### 登录用户也被 turnstile 挡

不应该。代码 `apps/api/src/routes/rewrite.ts` 第 102 行明确 `if (!userId && !req.installId)`
才校验。如果实际看到登录用户被挡，说明 `getSession` 在 worker 没拿到 cookie——查
better-auth cookie domain 是否正确（`.rewrite.so` 跨子域），不是 turnstile 配置问题。

### Site key 看起来像 secret（都以 0x4AAA 开头）

Cloudflare Turnstile 的 site key 和 secret key 都是 0x4AAA... 前缀，但**长度不同**——
secret 更长。如果配反了：
- secret 当 site key（前端）→ 暴露 secret 到 bundle，**严重安全事件**，立即 rotate
- site key 当 secret（后端）→ 服务端 verify 一直失败，所有匿名请求 403

部署前用 `wc -c` 对比一下两个 key 的长度别配错。

---

## 撤销 / Rollback

如果 turnstile 出意外影响生产用户：

```bash
# 立即让服务端 fail-open（生产用户不受影响）
cd apps/api
wrangler secret delete TURNSTILE_SECRET
# 不需要 redeploy，secret 立即生效
```

前端 widget 仍会加载（site key 还在），但服务端不验证。这是临时措施——
找根因（CF dashboard 看 site config / siteverify 的 error-codes）。

---

## 不在本文范围

- **Turnstile 升级到 visible widget**：当前用 invisible。如果未来想给可疑流量
  明确显示挑战，需改 TryClient.tsx 的 `size: 'invisible'`
- **管理多个 sitekey**（dev / staging / prod 分开）：当前一个 site 服务所有环境
  的 hostname；扩展后需同步 widget config 多份
- **Turnstile 加到登录 / 注册流程**：当前仅 /v1/rewrite 一个端点。如果 magic link
  发送 abuse 严重，可考虑加到 /api/auth/magic-link/request
