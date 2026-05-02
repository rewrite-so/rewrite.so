-- =====================================================================
-- 0002 - 用户邮件状态：onboarding 序列追踪 + unsubscribe
-- =====================================================================
-- 设计：
-- - users 表已有，不能加 NOT NULL 字段（D1 ALTER TABLE 限制 + 已有数据）
--   → 加可空字段或新建关联表。这里选新表，users 表不动，符合"不修旧表"原则。
-- - 每个用户最多 1 行；用 INSERT OR IGNORE 在第一次 cron 跑时初始化。
-- - 5 封邮件状态字段独立，重发时只查未发的。

CREATE TABLE IF NOT EXISTS user_email_state (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- 何时发过 welcome 邮件（NULL = 未发）
  welcome_sent_at    INTEGER,
  -- 何时发过 day-1 提醒
  d1_sent_at         INTEGER,
  -- 何时发过 day-7 BYOK 介绍
  d7_sent_at         INTEGER,
  -- 何时发过 day-14 升级 Pro 介绍
  d14_sent_at        INTEGER,
  -- 何时发过 day-30 retention 检查
  d30_sent_at        INTEGER,
  -- 用户取消订阅 onboarding 邮件的时间（不影响交易类邮件如 magic link / 收据）
  unsubscribed_at    INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

-- cron 扫描时按 created_at 选 due 的用户：
-- 如 day-1 邮件 = users.created_at < now()-24h AND user_email_state.d1_sent_at IS NULL
-- 加索引提升 cron 扫描效率。
CREATE INDEX IF NOT EXISTS idx_email_state_unsub ON user_email_state(unsubscribed_at);
