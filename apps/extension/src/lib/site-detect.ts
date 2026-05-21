/**
 * location.hostname → 粗粒度站点白名单标签。
 *
 * 隐私契约（CLAUDE.md「隐私与安全」段）：扩展埋点**绝不**记录真实 URL / path，
 * 只产出 packages/shared 的 SITE_LABELS 固定 enum；未识别站点一律 'other'。
 * 新增站点需同步更新 SITE_LABELS。
 */
import type { SiteLabel } from '@rewrite/shared';

/** hostname 后缀 → site 标签。后缀匹配覆盖 www. / 子域 / 多顶级域。 */
const HOST_SUFFIX_MAP: ReadonlyArray<readonly [string, SiteLabel]> = [
  ['reddit.com', 'reddit'],
  ['x.com', 'x'],
  ['twitter.com', 'x'],
  ['slack.com', 'slack'],
  ['notion.so', 'notion'],
  ['notion.com', 'notion'],
  ['github.com', 'github'],
  ['linkedin.com', 'linkedin'],
  ['discord.com', 'discord'],
];

/** 把 hostname 归入白名单标签；未识别返回 'other'（绝不回传真实域名）。 */
export function detectSite(hostname: string): SiteLabel {
  const h = hostname.toLowerCase();
  for (const [suffix, label] of HOST_SUFFIX_MAP) {
    if (h === suffix || h.endsWith(`.${suffix}`)) return label;
  }
  return 'other';
}
