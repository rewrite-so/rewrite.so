-- ===== admin_user_overrides (运营手术性 tier 调档) =====
-- subscriptions 表由 Creem webhook 状态机驱动；运营若想给某用户 force_tier='pro'
-- 或 'free' 而不污染 webhook 状态（避免被下次 event 覆盖），写本表覆盖层即可。
-- resolveUserTier() 优先查本表，命中且未过期 → 返回 force_tier，否则走 subscriptions。
--
-- 写入方：闭源 admin worker（rewrite-so/admin），通过 KV.delete('override:'+user_id)
-- 失效缓存。
-- 读取方：本仓库 lib/quota.ts resolveUserTier()，带 KV 缓存（key='override:'+user_id,
-- TTL 5min；NULL 命中也缓存 sentinel 防穿透）。
--
-- expires_at IS NULL 表示永久；超过即失效（resolveUserTier 内做时间比较，不依赖 cron 清理）。
CREATE TABLE IF NOT EXISTS admin_user_overrides (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  force_tier TEXT NOT NULL,                 -- 'pro' | 'free'
  reason     TEXT NOT NULL,
  expires_at INTEGER,                        -- Unix seconds; NULL = permanent
  created_by TEXT NOT NULL,                  -- admin_users.id (admin 仓库的表)
  created_at INTEGER NOT NULL
);
