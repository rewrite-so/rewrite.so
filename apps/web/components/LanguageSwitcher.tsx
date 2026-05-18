'use client';

import { LOCALES, type Locale } from '@rewrite/shared';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from '../i18n/navigation.ts';
import styles from './LanguageSwitcher.module.css';

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

export function LanguageSwitcher({ ariaLabel }: { ariaLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // click-outside + Esc 关闭。SSR 不能用 document,放 useEffect 内。
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function select(value: Locale) {
    setOpen(false);
    if (value === current) return;
    // 用 document.cookie 而非 Cookie Store API:后者尚未跨浏览器普遍支持,
    // 且这里只是同步写一个非敏感偏好 cookie,标准 API 已足够。
    // biome-ignore lint/suspicious/noDocumentCookie: see comment above
    document.cookie = `NEXT_LOCALE=${value}; path=/; max-age=31536000; samesite=lax`;
    router.replace(pathname, { locale: value });
  }

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={LABELS[current]}
      >
        <svg
          className={styles.triggerIcon}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className={styles.triggerShort}>{SHORT[current]}</span>
        <svg
          className={styles.triggerCaret}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className={styles.popover} role="menu">
          {LOCALES.map((locale) => {
            const isActive = locale === current;
            return (
              <button
                type="button"
                key={locale}
                role="menuitem"
                className={[styles.popoverItem, isActive ? styles.popoverItemActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => select(locale)}
              >
                <span className={styles.popoverItemShort}>{SHORT[locale]}</span>
                <span className={styles.popoverItemLabel}>{LABELS[locale]}</span>
                {isActive && (
                  <span className={styles.popoverItemCheck} aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
