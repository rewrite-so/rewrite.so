import type { MetadataRoute } from 'next';
import { routing } from '../i18n/routing.ts';
import { localePath } from './metadata.ts';

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://rewrite.so';

// 所有面向公众的页面（不含登录后页面 settings/billing 与一次性页 unsubscribe）。
const PUBLIC_PATHS = [
  '/',
  '/try',
  '/learn-english',
  '/pricing',
  '/early-bird',
  '/login',
  '/contact',
  '/terms',
  '/privacy',
  '/refund',
  '/aup',
] as const;

/**
 * 生成 sitemap.xml。
 * - 每个页面 × 每个 locale 一条 <url>
 * - 每条 <url> 含 alternates.languages 把同页所有 locale 列出（含 x-default → defaultLocale 路径）
 *   让 Google / Bing 知道页面互译关系
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const path of PUBLIC_PATHS) {
    const languages: Record<string, string> = {};
    for (const l of routing.locales) {
      languages[l] = `${SITE_ORIGIN}${localePath(l, path)}`;
    }
    languages['x-default'] = `${SITE_ORIGIN}${localePath(routing.defaultLocale, path)}`;
    for (const l of routing.locales) {
      entries.push({
        url: `${SITE_ORIGIN}${localePath(l, path)}`,
        alternates: { languages },
        // 不设 lastModified（避免每次部署假装内容变了被 Google 反复抓取）
      });
    }
  }
  return entries;
}
