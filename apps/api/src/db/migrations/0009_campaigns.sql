-- ===== campaigns (通用运营活动) + campaign_participations (报名记录) =====
--
-- 早鸟、礼品卡、推广码、推荐奖励等运营活动统一通过这两张表表达。
-- admin 仓库（apps/admin）写 CRUD；本仓库读用作前端营销页 + 报名端点。
--
-- type-specific 字段（如早鸟的 gift_days / discount.code）通过 config_json
-- TEXT 字段承载，结构由 packages/shared/src/campaigns.ts 的 Zod schema
-- 约束（admin 写表时强校验，主仓库读时不校验信任 admin）。
--
-- i18n_json 承载多语言营销文案（admin 可改文案无需发版），结构同样在
-- packages/shared/src/campaigns.ts 的 CampaignI18nSchema 定义。
--
-- 时间用 epoch ms 与其它业务表保持一致。
CREATE TABLE IF NOT EXISTS campaigns (
  id           TEXT PRIMARY KEY,                 -- camp_<ulid>
  type         TEXT NOT NULL,                    -- 'early_bird' | future: 'gift_card' | 'referral' | ...
  slug         TEXT NOT NULL UNIQUE,             -- URL-safe kebab-case
  enabled      INTEGER NOT NULL DEFAULT 0,       -- 0=关 1=开（admin 切换；主入口）
  starts_at    INTEGER NOT NULL,                 -- epoch ms
  ends_at      INTEGER NOT NULL,                 -- epoch ms
  capacity     INTEGER,                          -- NULL = 不限制报名人数
  config_json  TEXT NOT NULL,                    -- JSON, type-specific schema 见 packages/shared/src/campaigns.ts
  i18n_json    TEXT NOT NULL,                    -- JSON, { [locale]: { title, subtitle, heroBody, perksTitle, ctaText } }
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_type_enabled ON campaigns(type, enabled);

-- 用户参与活动的记录。perks_json 记录本次报名实际落地了哪些 perk（gift_grant ids /
-- user_discount keys），用于审计与回滚。每个 (user, campaign) 仅能参与一次（PK 幂等）。
CREATE TABLE IF NOT EXISTS campaign_participations (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  joined_at     INTEGER NOT NULL,                -- epoch ms
  perks_json    TEXT NOT NULL,                   -- { gift_grant_ids: string[], user_discount_keys: string[] }
  meta_json     TEXT,                            -- referrer / utm 等可选 metadata
  PRIMARY KEY (user_id, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_participations_campaign ON campaign_participations(campaign_id, joined_at);
