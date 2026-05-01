import { describe, expect, it } from 'vitest';
import { pickLocale, t } from './i18n.ts';

describe('pickLocale', () => {
  it('picks zh-CN for Chinese variants', () => {
    expect(pickLocale('zh-CN')).toBe('zh-CN');
    expect(pickLocale('zh-TW')).toBe('zh-CN'); // MVP 不区分简繁
    expect(pickLocale('zh')).toBe('zh-CN');
    expect(pickLocale('ZH-Hans')).toBe('zh-CN');
  });

  it('falls back to en for non-Chinese', () => {
    expect(pickLocale('en-US')).toBe('en');
    expect(pickLocale('ja-JP')).toBe('en');
    expect(pickLocale('fr')).toBe('en');
    expect(pickLocale(undefined)).toBe('en');
    expect(pickLocale('')).toBe('en');
  });
});

describe('t', () => {
  it('returns zh-CN string', () => {
    expect(t('hint.doubleShift', 'zh-CN')).toBe('按 Shift Shift 即可改写');
  });

  it('returns en string', () => {
    expect(t('hint.doubleShift', 'en')).toBe('Press Shift Shift to rewrite');
  });

  it('all keys defined for both locales', () => {
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
    ] as const;
    for (const k of keys) {
      expect(t(k, 'zh-CN')).not.toBe(k);
      expect(t(k, 'en')).not.toBe(k);
    }
  });
});
