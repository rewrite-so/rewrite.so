-- ===== usage_claims (匿名 → 登录 配额合并幂等表) =====
-- 当扩展登录用户首次在某个月调用 POST /v1/me/claim-install 时，
-- 把 ('install', installId, month_utc) 行的 count 加到 ('user', user_id, month_utc) 行，
-- 并在此表记录一行防重放。
--
-- 同一 (user_id, source_kind, source_id, month_utc) 第二次调用直接 no-op。
-- 跨月会重新生效（installId 用户跨月仍属于自己的设备）。
--
-- 现实中只 merge 'install' 一种 source_kind（IP 跨网络/跨日轮换 salt 没有稳定标识，
-- merge 价值低且实现复杂）。表设计预留 source_kind 给未来扩展（比如手机端 device_id）。
CREATE TABLE IF NOT EXISTS usage_claims (
  user_id      TEXT NOT NULL,
  source_kind  TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  month_utc    TEXT NOT NULL,
  -- 实际合并掉的 count（审计用），merge 完后 install 行 count 不动，仅靠此表防重放
  merged_count INTEGER NOT NULL,
  claimed_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_kind, source_id, month_utc)
);
CREATE INDEX IF NOT EXISTS idx_claims_source ON usage_claims(source_kind, source_id);
