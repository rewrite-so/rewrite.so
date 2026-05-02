import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, type Locale, pickLocale, resolveLocale, t } from './i18n.ts';

describe('LOCALES', () => {
  it('exports 7 concrete locales', () => {
    expect(LOCALES).toEqual(['en', 'zh-CN', 'ja', 'ko', 'es', 'fr', 'de']);
    expect(DEFAULT_LOCALE).toBe('en');
  });
});

describe('pickLocale', () => {
  it('picks zh-CN for any Chinese variant (incl. zh-TW until v0.2)', () => {
    expect(pickLocale('zh-CN')).toBe('zh-CN');
    expect(pickLocale('zh-TW')).toBe('zh-CN');
    expect(pickLocale('zh-Hant')).toBe('zh-CN');
    expect(pickLocale('zh')).toBe('zh-CN');
    expect(pickLocale('ZH-Hans')).toBe('zh-CN');
  });

  it('picks ja / ko / es / fr / de from BCP-47 primary tags', () => {
    expect(pickLocale('ja-JP')).toBe('ja');
    expect(pickLocale('ko-KR')).toBe('ko');
    expect(pickLocale('es-MX')).toBe('es');
    expect(pickLocale('fr-CA')).toBe('fr');
    expect(pickLocale('de-AT')).toBe('de');
  });

  it('falls back to en for non-matched / missing', () => {
    expect(pickLocale('en-US')).toBe('en');
    expect(pickLocale('it-IT')).toBe('en');
    expect(pickLocale(undefined)).toBe('en');
    expect(pickLocale('')).toBe('en');
  });
});

describe('resolveLocale', () => {
  it('returns stored when concrete', () => {
    expect(resolveLocale('ja', 'zh-CN')).toBe('ja');
    expect(resolveLocale('en', undefined)).toBe('en');
  });

  it("uses navLang when stored is 'auto'", () => {
    expect(resolveLocale('auto', 'zh-CN')).toBe('zh-CN');
    expect(resolveLocale('auto', 'ja-JP')).toBe('ja');
    expect(resolveLocale('auto', undefined)).toBe('en');
  });

  it('uses navLang when stored is undefined or unknown', () => {
    expect(resolveLocale(undefined, 'fr-FR')).toBe('fr');
    expect(resolveLocale('xx-XX', 'ko')).toBe('ko');
  });
});

describe('t', () => {
  it('resolves dot-path key for each locale', () => {
    expect(t('hint.doubleShift', 'en')).toBe('Press Shift Shift to rewrite');
    expect(t('hint.doubleShift', 'zh-CN')).toBe('按 Shift Shift 即可改写');
    expect(t('hint.doubleShift', 'ja')).toBe('Shift Shift で書き換え');
  });

  it('returns key itself when missing in all locales', () => {
    expect(t('totally.unknown.key', 'en')).toBe('totally.unknown.key');
    expect(t('totally.unknown.key', 'ja')).toBe('totally.unknown.key');
  });

  it('all known keys defined for all 7 locales', () => {
    const keys = [
      'hint.doubleShift',
      'hint.tryOnAnyInput',
      'cta.installExtension',
      'state.thinking',
      'error.rateLimit',
      'error.quotaExceeded',
      'error.upstream',
      'error.tooLong',
      'error.invalidInput',
      'error.unauthorized',
      'error.network',
      'placeholder.tryHere',
    ];
    for (const locale of LOCALES) {
      for (const k of keys) {
        const value = t(k, locale satisfies Locale);
        expect(value, `${locale}.${k}`).not.toBe(k);
        expect(value.length, `${locale}.${k}`).toBeGreaterThan(0);
      }
    }
  });
});
