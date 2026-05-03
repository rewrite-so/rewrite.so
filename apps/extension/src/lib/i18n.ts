import { type Locale, resolveLocale, t as sharedT } from '@rewrite/shared';
import { useEffect, useState } from 'preact/hooks';
import { getUserPrefs, onPrefsChanged } from './storage.ts';

/**
 * Preact hook：返回当前 UI locale（读 chrome.storage.local 的 userPrefs.uiLocale，
 * 'auto' 时按 navigator.language 解析）。监听 storage 变化自动重渲染。
 *
 * 用法：
 *   const locale = useUiLocale();
 *   const t = useT();
 *   <p>{t('hint.doubleShift')}</p>
 */
export function useUiLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale('auto', navigator.language));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prefs = await getUserPrefs();
      if (cancelled) return;
      setLocale(resolveLocale(prefs.uiLocale, navigator.language));
    })();
    const off = onPrefsChanged((next) => {
      setLocale(resolveLocale(next.uiLocale, navigator.language));
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  return locale;
}

/**
 * Preact hook：返回 `t(key)` 函数，已绑定当前 UI locale。
 *
 * 用法：
 *   const t = useT();
 *   <h1>{t('page.try.h1')}</h1>
 */
export function useT(): (key: string) => string {
  const locale = useUiLocale();
  return (key: string) => sharedT(key, locale);
}
