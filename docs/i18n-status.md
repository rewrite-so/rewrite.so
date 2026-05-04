# i18n 翻译状态跟踪

记录 7 个 locale 的母语 review 进度，避免不同时期接手的人不知道哪个 locale 可信、哪个待校。

> 翻译反馈渠道：扩展 popup 底部"Report wrong translation →"链接，预填邮件到 `hello@rewrite.so`，subject 含 locale。

## 各 locale 状态

| Locale | 来源 | 母语 reviewer | 最后审阅 | 已知 issues |
|---|---|---|---|---|
| `en` | 原始撰写 | 项目维护者（母语级） | 持续 | — |
| `zh-CN` | 原始撰写 | 项目维护者（母语） | 持续 | `zh-TW` 临时归并到 `zh-CN`（用户反馈 ≥3 后再拆） |
| `ja` | LLM 初稿 | 待招募 | 未审 | UX 用语未由日语母语者校对；popup feedback 已上线收集 |
| `ko` | LLM 初稿 | 待招募 | 未审 | 同上 |
| `es` | LLM 初稿 | 待招募 | 未审 | 同上；西语区域差异大（拉美 vs 半岛）暂未区分 |
| `fr` | LLM 初稿 | 待招募 | 未审 | 同上；魁北克 vs 法国变体未区分 |
| `de` | LLM 初稿 | 待招募 | 未审 | 同上；瑞士德语 / 奥地利德语未区分 |

## 流程约定

- **新加 key**：必须 7 locale 同步加（CI gate `pnpm i18n:validate` 强制）。先在 en 写定稿，
  用 `scripts/i18n-translate.ts`（待补）跑 LLM 初稿到其它 6 个，PR description 标
  "AI-translated, awaiting native review"。
- **改既有 key 文案**：仅改触发 review 的 locale；其它 locale 用 i18n-validate 工具
  对比 key 出现位置确认不漏。
- **母语 reviewer 来稿**：单独 PR，commit message 标 `i18n(<locale>): native review by <name>`，
  本表"最后审阅"列更新对应 commit hash。

## 招募 reviewer

如果你是上述 5 个 locale 之一的母语使用者，邮件 `hello@rewrite.so` 主题 "i18n review: <locale>"。
建议工作量：阅读 `packages/shared/src/messages/<locale>.json`（约 372 keys），把不自然/
错误的标出来回邮。我们按 PR 合入并致谢。

## 复议条件

- **`zh-TW` 拆出**：≥3 名繁体用户反馈差异强烈（来自 popup feedback 链接的 mailto）→ 新建
  `zh-TW.json` + 改 `LOCALES` 数组 + 复制 zh-CN 后由繁体母语者改差异点。
- **新加 locale**（如 `pt-BR` / `it`）：触发条件 = ≥10 用户用该浏览器 navigator.language 访问
  并发起改写（需要 telemetry 才能观测——目前我们故意不收集）。MVP 先靠 GitHub Issues 收集需求。
