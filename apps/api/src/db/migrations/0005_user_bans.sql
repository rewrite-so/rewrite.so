-- ===== user_bans (账号封禁) =====
-- 由闭源 admin worker 写入；本仓库 middleware/ban-check.ts 在 better-auth session
-- 解析后、所有需要登录态的路由（/v1/rewrite 登录路径 + /v1/me/* + billing endpoints）
-- 之前查本表，命中返 401 { error: 'user_banned', reason }。
--
-- expires_at IS NULL 表示永封；超过即自动失效（middleware 内做时间比较，不依赖 cron 清理）。
-- 匿名 install/IP 路径不触发该 middleware（这些维度由 quota + token bucket + Turnstile 治理）。
CREATE TABLE IF NOT EXISTS user_bans (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  reason     TEXT NOT NULL,
  banned_by  TEXT NOT NULL,                 -- admin_users.id (admin 仓库的表)
  banned_at  INTEGER NOT NULL,
  expires_at INTEGER                         -- Unix seconds; NULL = permanent
);
