# 灾难恢复 Runbook

事故场景到操作步骤的速查。代码层契约见 `CLAUDE.md`，本文专注**当事情已经坏了**怎么办。

## 角色 + 工具

操作者必备：
- Cloudflare 账户访问（dashboard + API token）
- `wrangler` CLI 已登录到 prod 账号（`wrangler whoami`）
- GitHub repo write 权限（紧急回滚用）

---

## 场景 1：刚 deploy 的 commit 把 prod 搞挂了

**触发信号**：`/health/deep` 返 503，UptimeRobot 告警，用户报错。

**操作**：
1. **立即回滚**——通过 git revert 触发 CI 重 deploy（最稳，5 分钟）：
   ```bash
   git log --oneline -5             # 找到坏的 commit
   git revert <bad-sha> --no-edit
   git push origin main             # 触发 deploy-api / deploy-web
   ```
2. **CF dashboard 紧急回滚**（30 秒，但绕过 CI）：
   - Workers & Pages → `rewrite-api` → Deployments
   - 找上一个绿色版本 → "Rollback to this deployment"
   - **注意**：D1 migrations 不会回滚（migrations 是单向的）。如果坏的 commit 改了 schema，
     需要手写补偿 migration（场景 3）。
3. 确认 `/health/deep` 恢复后再调查根因。

---

## 场景 2：D1 数据被错误改写 / 删除

**触发信号**：用户报"我的订阅没了"/"配额被重置"等；或自检 `wrangler d1 execute` 返奇怪结果。

**Cloudflare D1 内置 time-travel**（30 天回溯，Paid plan）：

```bash
# 列出可用的还原点（每次写操作都会产生 bookmark）
wrangler d1 time-travel info rewrite-so

# 还原到指定时间（UTC ISO 或 unix timestamp）
wrangler d1 time-travel restore rewrite-so --timestamp '2026-05-04T08:00:00Z'

# 或还原到具体 bookmark（更精确，但需要先 info 拿到 ID）
wrangler d1 time-travel restore rewrite-so --bookmark <bookmark-id>
```

**关键约束**：
- time-travel 是**整库还原**，不能选表。会丢失自该时间点之后的所有写入（包括正常写入）
- 优先评估能不能通过应用层补偿（如手动 INSERT 一行）而非全库回滚
- 还原前**必须** `wrangler d1 export rewrite-so --output=before-restore.sql` 备份当前状态

### 各业务表丢失影响等级

| 表 | 丢失影响 | 恢复优先级 | 备注 |
|---|---|---|---|
| `subscriptions` | 高 | P0 | Pro 用户付了钱却拿不到访问权；webhook 重发可补但需联系 Creem |
| `usage_monthly` | 中 | P1 | 用户当月配额"清零"——他们是赚的；下月自动恢复正常 |
| `byok_keys` | 高 | P0 | 加密 key 丢失，用户得重新输入。AES-GCM 密文丢失无法恢复明文 |
| `user_settings` | 低 | P2 | 默认值兜底（'auto' / 'auto'），用户不感（只是 prefs 重置） |
| `usage_claims` | 极低 | P3 | 仅幂等防重放——丢了用户登录会再 claim 一次没事 |
| `webhook_events` | 极低 | P3 | 仅幂等防重放——webhook 重投递会再处理一次没事 |
| better-auth 4 表 | 致命 | P0 | 用户全部退登，session 失效，必须立刻通知用户重新登录 |

### Creem 订阅状态丢失的特殊路径

如果只是 `subscriptions` 表丢了（其它表正常），不必走 D1 time-travel：

```bash
# 1. Creem 那边查最近 N 天有效订阅（dashboard 或 GET /v1/subscriptions）
# 2. 触发 /v1/billing/verify-checkout 主动 reconcile（用户路径）
# 3. 或等 webhook reconcile cron 自动跑（见下）—— 每日 09:00 UTC
```

---

## 场景 3：Schema 误改 / migration 出问题

**已 deploy 过的 migration 不能改**（CLAUDE.md 契约：wrangler 用 `d1_migrations` 表跟踪，
改了的会跳过你的修改）。

**操作**：写补偿 migration `0NNN_fix_<desc>.sql`：

```bash
# 1. 本地写 migration，dry-run
wrangler d1 migrations apply rewrite-so --local --file=apps/api/src/db/migrations/0004_fix_xxx.sql

# 2. 直接对 prod 跑（不通过 CI；保险起见手动）
wrangler d1 migrations apply rewrite-so --remote
```

**严禁**：删除 / 改写 `apps/api/src/db/migrations/0001_init.sql` 等已应用文件。这会让
本地新克隆的开发环境与 prod schema 不一致，后续 migration 更难维护。

---

## 场景 4：webhook 长时间未到达 / Creem dashboard 显示已支付但 D1 里没订阅

**应急路径**：用户带着 checkout_id 跳回 `/settings?billing=ok&checkout_id=xxx`，前端会自动
调 `/v1/billing/verify-checkout` reconcile。

**没有 checkout_id 的情况**（用户清了 query / 跳错了页）：
1. Cloudflare dashboard 看 webhook 请求日志（`wrangler tail` 实时；或 Workers Logs 历史）
2. 在 Creem dashboard 找到该 subscription，"Retry webhook" 按钮
3. **兜底**：每日 cron `/cron/reconcile-subscriptions` 会列最近 24h 内 Creem 的所有 active
   订阅，缺失的补落库（见 `apps/api/src/cron/reconcile.ts`）

---

## 场景 5：BYOK_MASTER_KEY 误改 / 泄露

**误改**：所有 `byok_keys` 表里的密文都解密失败 → /v1/rewrite 返 500
`byok_decrypt_failed`。

恢复：把 master key 改回原值。**仍然不行的话**：删全表（`wrangler d1 execute rewrite-so
--command="DELETE FROM byok_keys"`），通知用户重新配 BYOK。

**泄露**：master key 通过 git / 截图 / 共享文档泄露给外部。
1. 立即 `wrangler secret put BYOK_MASTER_KEY` 改新 key
2. **不可避免**：所有现存 byok_keys 行解密失败（旧 key 加密的密文）
3. 删全表 + 通知用户重新配
4. `key_version` 字段保留给未来多 key 轮换用，MVP 没实现"两 key 共存解密"——这次必须 hard reset

---

## 监控 + 告警入口

- **/health/deep**：`apps/api/src/index.ts` L34，UptimeRobot 已挂在 `Footer` 链接
  `https://stats.uptimerobot.com/ISstIMdFhH`
- **Cloudflare Workers Logs**：`wrangler.toml` `[observability] enabled = true`
  开启了 CF 内置日志收集 —— dashboard 可搜索/告警，retain 7 天（Free）/ 更长（Paid）
- **Creem dashboard**：webhook 投递状态、subscription 状态都在 Creem 那边查
- **GitHub Actions**：deploy 失败会发 email 给 repo owner

---

## 不在本文范围

- 性能问题（响应慢但功能正常）→ `wrangler tail` + p50/p99 分析
- 用户个例支持工单 → Creem refund + `hello@rewrite.so`
- 安全 incident（数据泄露 / 入侵）→ 单独 incident-response.md（待补，触发再写）
