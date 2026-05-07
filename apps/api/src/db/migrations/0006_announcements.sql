-- ===== announcements (站内公告 / banner) =====
-- 闭源 admin worker 写入 CRUD；本仓库新增 GET /v1/announcements 公开端点供
-- web/extension 拉取并渲染 banner / modal。
--
-- tier_filter 列存在但**不接受 client query 参数**：路由内服务端从 better-auth
-- session 解析 user → resolveUserTier() 强制覆写匹配条件。匿名请求只看到
-- tier_filter IS NULL 的通用公告。这样能避免任何访客通过 ?tier=pro 探测 pro
-- 专属运营策略。
--
-- locale_filter / surfaces 接受 client 参数（locale 是用户当前 UI 语言，surface
-- 是来源 'web' / 'extension'，没有泄露风险）。
--
-- title_i18n / body_i18n / cta_i18n 是 JSON 字符串，结构由前端约定：
--   title_i18n: { "en": "...", "zh-CN": "...", ... }
--   cta_i18n:   { "en": { "label": "...", "href": "..." }, ... }
-- 应用层负责 fallback：locale 无对应翻译 → 用 'en'。
CREATE TABLE IF NOT EXISTS announcements (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,                 -- 'banner' | 'modal'
  surfaces      TEXT NOT NULL,                 -- JSON array, e.g. ["web","extension"]
  locale_filter TEXT,                          -- single BCP-47 locale, NULL = all
  tier_filter   TEXT,                          -- 'free' | 'pro' | NULL = everyone
  title_i18n    TEXT NOT NULL,                 -- JSON: { locale: title }
  body_i18n     TEXT NOT NULL,                 -- JSON: { locale: body }
  cta_i18n      TEXT,                          -- JSON: { locale: { label, href } } | NULL
  starts_at     INTEGER NOT NULL,              -- Unix seconds
  ends_at       INTEGER NOT NULL,              -- Unix seconds
  priority      INTEGER NOT NULL DEFAULT 0,    -- ORDER BY priority DESC, starts_at DESC
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_announcements_window ON announcements(starts_at, ends_at);
