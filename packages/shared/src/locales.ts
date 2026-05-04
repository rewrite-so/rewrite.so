export type Locale = 'en' | 'zh-CN' | 'ja' | 'ko' | 'es' | 'fr' | 'de';

export type StoredLocale = Locale | 'auto';

export const LOCALES: readonly Locale[] = ['en', 'zh-CN', 'ja', 'ko', 'es', 'fr', 'de'];
export const DEFAULT_LOCALE: Locale = 'en';

export const STORED_LOCALE_VALUES: readonly StoredLocale[] = ['auto', ...LOCALES];

/**
 * 从 navigator.language 选具体 locale。
 * - 中文（含 zh-TW、zh-Hant、zh-Hans）当前都归并到 'zh-CN'（v0.2 复议拆 zh-TW）
 * - 其它语言按 BCP-47 主标签匹配
 * - 找不到匹配回退 'en'
 */
export function pickLocale(navLang: string | undefined): Locale {
  if (!navLang) return DEFAULT_LOCALE;
  const lower = navLang.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('ko')) return 'ko';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

/**
 * 把存储的 locale（可能为 'auto'）解析为运行时具体 locale。
 * - 'auto' 或不识别值：用 pickLocale(navLang) 推导
 * - 具体 locale：原样返回
 */
export function resolveLocale(stored: StoredLocale | string | undefined, navLang?: string): Locale {
  if (stored && stored !== 'auto' && (LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  return pickLocale(navLang);
}
