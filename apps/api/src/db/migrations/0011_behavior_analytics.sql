-- ===== behavior_events + rewrite_request_log (D1 行为分析精确镜像) =====
--
-- 遥测原本只写 Cloudflare Analytics Engine (AE)。AE 采样 + SQL 函数子集受限，
-- 无法可靠做逐用户/逐游客行为分析。这两张表是 AE 的 D1 精确镜像（无采样、
-- 全 SQL、可 JOIN 业务表），作为逐实体真相源；AE 继续喂现成聚合看板。
--
-- 写入：apps/api/src/routes/events.ts（behavior_events）+ routes/rewrite.ts
--   经 metrics.ts（rewrite_request_log），均 fire-and-forget waitUntil。
-- 保留：apps/api/src/cron/prune-behavior-log.ts，90 天（与 AE 一致）。
-- 读取：闭源 admin 仓（apps/admin）直接读这两张表做时间线/漏斗/脉搏看板。
--   ⚠️ 跨仓耦合：schema 变更须知会 admin 维护者（同 AE blob-map 同步纪律）。
--
-- 时间用 epoch ms，与其它业务表一致。

-- 每条 /v1/events 事件一行。列对齐 event-metrics.ts 的 AE blob map（两存储可 diff）。
CREATE TABLE IF NOT EXISTS behavior_events (
  id              INTEGER PRIMARY KEY,
  ts              INTEGER NOT NULL,   -- 客户端 ev.ts；落库时 clamp 到 created_at 附近
  event_name      TEXT    NOT NULL,
  subject_kind    TEXT    NOT NULL,   -- user | visitor | install | anonymous_no_id
  subject_id_hash TEXT,               -- 16-hex；anonymous_no_id 为 NULL
  session_id      TEXT,               -- per-session 标记；缺失为 NULL
  page            TEXT    NOT NULL,   -- locale-stripped path；扩展恒 '/ext'
  locale          TEXT    NOT NULL,
  referrer_host   TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  country         TEXT,               -- CF 自动地理；缺失为 NULL
  device_type     TEXT,               -- mobile | desktop | tablet
  tier            TEXT    NOT NULL,   -- anon | free | pro | byok
  site            TEXT,               -- 扩展粗粒度站点 enum
  props_json      TEXT,               -- 已校验 JSON（<=200 字节）；服务端逻辑可读，绝不回传客户端
  created_at      INTEGER NOT NULL    -- 服务端落库时间；所有分析（prune/分桶/漏斗窗）用此列
);
-- 逐实体时间线（按 ts 展示排序）
CREATE INDEX IF NOT EXISTS idx_be_subject_ts  ON behavior_events(subject_id_hash, ts);
-- 按会话分组
CREATE INDEX IF NOT EXISTS idx_be_session_ts  ON behavior_events(session_id, ts);
-- 漏斗（按服务端 created_at 时间窗）
CREATE INDEX IF NOT EXISTS idx_be_event_created ON behavior_events(event_name, created_at);
-- 保留期 prune
CREATE INDEX IF NOT EXISTS idx_be_created     ON behavior_events(created_at);

-- 每次 /v1/rewrite 请求一行。镜像 metrics.ts 的 RequestMetric。
-- ts 是 metric 服务端 emit 时间（无客户端时钟问题），prune/分析直接用 ts。
CREATE TABLE IF NOT EXISTS rewrite_request_log (
  id                    INTEGER PRIMARY KEY,
  ts                    INTEGER NOT NULL,   -- 服务端 emit 时间，epoch ms
  tier                  TEXT    NOT NULL,   -- anonymous_ip | anonymous_install | free | pro | byok
  subject_id_hash       TEXT,               -- 16-hex；缺失为 NULL
  styles_csv            TEXT    NOT NULL,   -- 排序后逗号分隔
  target_lang           TEXT    NOT NULL,   -- sanitized，<=30 字符
  target_lang_is_custom INTEGER NOT NULL,   -- 0 | 1
  is_regen              INTEGER NOT NULL,   -- 0 | 1
  status                TEXT    NOT NULL,   -- ok | aborted | upstream_error | quota_exceeded | banned | invalid
  error_code            TEXT,
  upstream              TEXT    NOT NULL,   -- platform | byok
  input_length_bucket   TEXT    NOT NULL,
  input_length          INTEGER NOT NULL,
  ms_to_first_byte      INTEGER,
  ms_total              INTEGER,
  style_count           INTEGER NOT NULL
);
-- 逐实体时间线
CREATE INDEX IF NOT EXISTS idx_rrl_subject_ts ON rewrite_request_log(subject_id_hash, ts);
-- 保留期 prune
CREATE INDEX IF NOT EXISTS idx_rrl_ts         ON rewrite_request_log(ts);
