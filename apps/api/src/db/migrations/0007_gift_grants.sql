-- ===== gift_grants (通用「赠送 Pro 时长」记账) =====
--
-- 任何来源（早鸟报名、礼品卡兑换、客服补偿、抽奖）统一落这张表。
-- resolveUserTier() 在 admin_user_overrides → subscriptions 之后兜底查这张表：
-- status='active' 且 expires_at > now 即视为 pro。
--
-- 与 subscriptions 表对齐用 **epoch ms**（不是 Unix seconds），便于
-- 与 subscription.current_period_end 等业务时间戳直接 max() 比较。
--
-- id 由 caller 用确定性公式生成（见 apps/api/src/lib/gift-grants.ts:grantDays）：
--   sha256(user_id + ':' + source_kind + ':' + source_id).slice(0, 12)
-- 同一 source 重试 → 同 id → PK 冲突被 INSERT OR IGNORE 兜住 = 幂等。
-- 想给同用户叠加多张赠送（如 admin 多次补偿）→ caller 必须让 source_id 每次不同
-- （建议附 timestamp），让 id 散开。
--
-- source_id NOT NULL：SQLite 允许 NULL 多次出现在 PK / UNIQUE 索引，会让幂等
-- 防御失效。Phase 1 所有 source_kind 都必有 source_id（campaign_id / code / admin+ts）。
CREATE TABLE IF NOT EXISTS gift_grants (
  id            TEXT PRIMARY KEY,                 -- 确定性 id，公式见 lib/gift-grants.ts
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  days          INTEGER NOT NULL,
  granted_at    INTEGER NOT NULL,                 -- epoch ms; 多张赠送续期叠加时 = max(now, currentMaxExpiresAt, caller_baseEnd)
  expires_at    INTEGER NOT NULL,                 -- epoch ms = granted_at + days*86400000
  source_kind   TEXT NOT NULL,                    -- 'campaign' | 'redemption' | 'admin' | 'system'
  source_id     TEXT NOT NULL,                    -- NOT NULL（见上）
  status        TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'revoked'
  note          TEXT,                             -- admin 可读说明
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_grants_user_active ON gift_grants(user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_gift_grants_source      ON gift_grants(source_kind, source_id);
