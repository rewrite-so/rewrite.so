import de from './messages/de.json';
import en from './messages/en.json';
import es from './messages/es.json';
import fr from './messages/fr.json';
import ja from './messages/ja.json';
import ko from './messages/ko.json';
import zhCN from './messages/zh-CN.json';

export {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
  pickLocale,
  resolveLocale,
  STORED_LOCALE_VALUES,
  type StoredLocale,
} from './locales.ts';

import type { Locale } from './locales.ts';

/**
 * 改写目标语言（rewrite target）—— 与 UI locale 完全独立。
 * UI 只能是 LOCALES 中的 7 个；改写目标可以是这 22 个里的任何一个，
 * 也可以是 'auto'（让 detectTargetLang 在调用方运行时推导）。
 *
 * API 端不限制具体 BCP-47 值（z.string().min(1).max(20)）；prompt 直接拿
 * 字符串注入到 system prompt。新增/删除一个 target 只需改这两个常量。
 */
export const REWRITE_TARGETS = [
  'en',
  'zh-CN',
  'zh-TW',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'ru',
  'ar',
  'hi',
  'nl',
  'pl',
  'tr',
  'vi',
  'id',
  'th',
  'sv',
  'da',
  'he',
] as const;
export type RewriteTarget = (typeof REWRITE_TARGETS)[number];

/**
 * 改写目标的原生显示名（用于 UI 下拉选项）。
 * 故意用各语言的原生写法 —— 避免依赖当前 UI locale 翻译，单一来源。
 */
export const REWRITE_TARGET_LABELS: Record<RewriteTarget, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  nl: 'Nederlands',
  pl: 'Polski',
  tr: 'Türkçe',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  th: 'ไทย',
  sv: 'Svenska',
  da: 'Dansk',
  he: 'עברית',
};

/**
 * @deprecated Use `string`. Kept for backward compatibility with call sites
 * that imported `I18nKey` when keys were a literal union.
 */
export type I18nKey = string;

type MessageNode = string | { [key: string]: MessageNode };
type MessageTree = Record<string, MessageNode>;

const MESSAGES: Record<Locale, MessageTree> = {
  en: en as MessageTree,
  'zh-CN': zhCN as MessageTree,
  ja: ja as MessageTree,
  ko: ko as MessageTree,
  es: es as MessageTree,
  fr: fr as MessageTree,
  de: de as MessageTree,
};

function lookup(tree: MessageTree, key: string): string | undefined {
  const segments = key.split('.');
  let node: MessageNode | undefined = tree;
  for (const seg of segments) {
    if (node && typeof node === 'object' && seg in node) {
      node = (node as { [k: string]: MessageNode })[seg];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * 查询翻译。点路径（如 'error.rateLimit'）。
 * 缺失时按 locale → 'en' → key 回退。
 */
export function t(key: string, locale: Locale): string {
  const direct = lookup(MESSAGES[locale] ?? MESSAGES.en, key);
  if (direct !== undefined) return direct;
  if (locale !== 'en') {
    const fallback = lookup(MESSAGES.en, key);
    if (fallback !== undefined) return fallback;
  }
  return key;
}

export const __TEST__ = { MESSAGES, lookup };
