'use client';

import { LOCALES, type Locale } from '@rewrite/shared';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '../i18n/navigation.ts';

const LABELS: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

const SHORT: Record<Locale, string> = {
  en: 'EN',
  'zh-CN': '中',
  ja: '日',
  ko: '한',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
};

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const current = useLocale() as Locale;

  function onChange(value: Locale) {
    // 用 document.cookie 而非 Cookie Store API：后者尚未跨浏览器普遍支持，
    // 且这里只是同步写一个非敏感偏好 cookie，标准 API 已足够。
    // biome-ignore lint/suspicious/noDocumentCookie: see comment above
    document.cookie = `NEXT_LOCALE=${value}; path=/; max-age=31536000; samesite=lax`;
    router.replace(pathname, { locale: value });
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={current}
        onChange={(e) => onChange(e.currentTarget.value as Locale)}
        aria-label="Language"
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          fontSize: 12,
          fontFamily: 'inherit',
          padding: '5px 22px 5px 9px',
          color: '#444',
          background: 'transparent',
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 6,
          cursor: 'pointer',
          outline: 'none',
        }}
        title={LABELS[current]}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {SHORT[l]} · {LABELS[l]}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 9,
          color: '#888',
          pointerEvents: 'none',
        }}
      >
        ▾
      </span>
    </div>
  );
}
