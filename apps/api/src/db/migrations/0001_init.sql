-- =====================================================================
-- rewrite.so D1 schema 0001 - Phase 2
-- 手写 SQL，不用 ORM 迁移工具（drizzle 仅用作 better-auth 的 4 表 adapter）
-- =====================================================================

-- ===== users (better-auth core) =====
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  name            TEXT,
  image           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- ===== sessions (better-auth core) =====
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at      INTEGER NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- ===== accounts (better-auth: OAuth 关联) =====
CREATE TABLE IF NOT EXISTS accounts (
  id                            TEXT PRIMARY KEY,
  user_id                       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id                    TEXT NOT NULL,
  provider_id                   TEXT NOT NULL,
  access_token                  TEXT,
  refresh_token                 TEXT,
  id_token                      TEXT,
  access_token_expires_at       INTEGER,
  refresh_token_expires_at      INTEGER,
  scope                         TEXT,
  password                      TEXT,
  created_at                    INTEGER NOT NULL,
  updated_at                    INTEGER NOT NULL,
  UNIQUE(provider_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

-- ===== verifications (better-auth: Magic Link 验证码 / OTP) =====
CREATE TABLE IF NOT EXISTS verifications (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verifications_identifier ON verifications(identifier);

-- ===== subscriptions (Creem 镜像，Phase 4 启用) =====
CREATE TABLE IF NOT EXISTS subscriptions (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creem_subscription_id     TEXT NOT NULL UNIQUE,
  creem_customer_id         TEXT NOT NULL,
  product_id                TEXT NOT NULL,
  -- 'monthly' | 'yearly'
  plan                      TEXT NOT NULL,
  -- 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'
  status                    TEXT NOT NULL,
  current_period_start      INTEGER NOT NULL,
  current_period_end        INTEGER NOT NULL,
  cancel_at_period_end      INTEGER NOT NULL DEFAULT 0,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);

-- ===== usage_monthly (按 UTC 自然月聚合的配额计数) =====
-- subject_kind: 'user' / 'install' / 'ip'
-- subject_id:   user.id / installId / sha256(ip + daily_salt) 之一
-- 这样避免表达式 PK，同时保持"匿名 → 登录"过渡的简单 merge 逻辑：
--   登录时把 ('install', installId) 和 ('ip', ip_hash) 行迁移到 ('user', userId)
CREATE TABLE IF NOT EXISTS usage_monthly (
  subject_kind  TEXT NOT NULL,
  subject_id    TEXT NOT NULL,
  -- 'YYYY-MM' UTC
  month_utc     TEXT NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  -- BYOK 用户单独计但不计入配额
  byok_count    INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (subject_kind, subject_id, month_utc)
);
CREATE INDEX IF NOT EXISTS idx_usage_subject ON usage_monthly(subject_id, month_utc);

-- ===== byok_keys (BYOK 配置，Phase 4 启用) =====
CREATE TABLE IF NOT EXISTS byok_keys (
  user_id              TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  base_url             TEXT NOT NULL,
  model                TEXT NOT NULL,
  -- AES-GCM 密文（base64 编码）
  encrypted_api_key    TEXT NOT NULL,
  iv                   TEXT NOT NULL,
  key_version          INTEGER NOT NULL DEFAULT 1,
  -- 末 4 位明文供用户确认
  key_mask             TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

-- ===== user_settings (账号级偏好) =====
CREATE TABLE IF NOT EXISTS user_settings (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_lang    TEXT NOT NULL DEFAULT 'auto',
  ui_locale      TEXT NOT NULL DEFAULT 'auto',
  updated_at     INTEGER NOT NULL
);

-- ===== webhook_events (Creem webhook 幂等键，Phase 4 启用) =====
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id       TEXT PRIMARY KEY,
  source         TEXT NOT NULL,
  received_at    INTEGER NOT NULL,
  payload        TEXT
);
