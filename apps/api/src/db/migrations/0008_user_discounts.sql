-- ===== user_discounts (单用户 checkout 自动注入的折扣码) =====
--
-- Creem 不支持 customer-bound 折扣，所以每次 createCheckoutSession 都需要
-- 主动从这张表查 user 的可用折扣码并透传到 Creem。同一时刻每个 user
-- 最多一行 active 状态的折扣（Phase 1 早鸟唯一来源）。
--
-- 「Pro 资格在线时生效，60 天宽限期可恢复，超期永久失效」用 pro_lapses_at
-- 状态机表达（单调递增字段）：
--
--   字段语义：「按当前已知信息，Pro 资格预计在这个时间点彻底丢失（已含宽限期）」
--
--   更新点（都用 max(原值, 新值) 单调推进）：
--     1) gift_grants 写入时：pro_lapses_at = max(原, gift.expires_at + grace*86400000)
--     2) webhook subscription.active/trialing：max(原, sub.current_period_end + grace*86400000)
--     3) webhook subscription.canceled/expired：不更新（current_period_end 已在 #2 记录过）
--
--   读取（lazy-on-read，无 cron）：
--     if now > pro_lapses_at AND status='active' → 写 status='expired' 并返回 null
--
-- 边界 case：
--   - 报名→立即 active(30d)→cancel→不续：active webhook 推 pro_lapses_at 到 +90d；
--     第 89 天 resub 仍享 3 折；第 91 天 resub 失效
--   - 报名→从未订阅→150 天内首次订阅享 3 折；超过失效
--   - 报名时已 Pro：gift_grants.granted_at 延后到 sub 期末（见 routes/campaigns.ts）
--
-- source_id NOT NULL：参与 PK，NULL 会让 PK 失效；同 user_discounts 设计。
CREATE TABLE IF NOT EXISTS user_discounts (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code               TEXT NOT NULL,                  -- 必须与 Creem dashboard 折扣码完全一致。当前 prod 早鸟码 = 'ISIZATWC8P'（来自 campaigns.config_json，admin SPA 配）；schema 例只是占位。
  percentage         INTEGER NOT NULL,               -- 70 = 70% off = 中文「3 折」（用户付 30%）
  duration           TEXT NOT NULL,                  -- 'forever' | 'once' | 'repeating'
  source_kind        TEXT NOT NULL,                  -- 'campaign'
  source_id          TEXT NOT NULL,                  -- 例 campaign_id
  valid_from         INTEGER NOT NULL,               -- epoch ms
  expires_at         INTEGER,                        -- epoch ms; NULL = 不主动过期（duration=forever）
  pro_lapses_at      INTEGER,                        -- epoch ms; NULL = 从未拥有过 Pro 资格（首次 active webhook 前）
  grace_period_days  INTEGER NOT NULL DEFAULT 60,    -- 写入时从 campaigns.config_json.perks.discount.grace_period_days 拷贝
  status             TEXT NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'revoked'
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_kind, source_id)
);
CREATE INDEX IF NOT EXISTS idx_user_discounts_status ON user_discounts(user_id, status);
