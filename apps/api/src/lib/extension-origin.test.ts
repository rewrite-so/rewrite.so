import { describe, expect, it } from 'vitest';
import { isAllowedExtensionOrigin } from './extension-origin.ts';

const PROD_ENV = {
  BETTER_AUTH_URL: 'https://api.rewrite.so',
  EXTENSION_ALLOWED_ORIGINS: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
};

const DEV_ENV = {
  BETTER_AUTH_URL: 'http://localhost:8787',
  EXTENSION_ALLOWED_ORIGINS: '',
};

describe('isAllowedExtensionOrigin', () => {
  it('rejects non-extension origins', () => {
    expect(isAllowedExtensionOrigin('https://rewrite.so', PROD_ENV)).toBe(false);
    expect(isAllowedExtensionOrigin('https://evil.com', PROD_ENV)).toBe(false);
    expect(isAllowedExtensionOrigin('', PROD_ENV)).toBe(false);
    expect(isAllowedExtensionOrigin(null, PROD_ENV)).toBe(false);
    expect(isAllowedExtensionOrigin(undefined, PROD_ENV)).toBe(false);
  });

  it('accepts allowlisted extension origin in production', () => {
    expect(
      isAllowedExtensionOrigin('chrome-extension://abcdefghijklmnopabcdefghijklmnop', PROD_ENV),
    ).toBe(true);
  });

  it('rejects unlisted extension origin in production', () => {
    expect(
      isAllowedExtensionOrigin('chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', PROD_ENV),
    ).toBe(false);
  });

  it('accepts bare extension id (no chrome-extension:// prefix) in env allowlist', () => {
    expect(
      isAllowedExtensionOrigin('chrome-extension://abcdefghijklmnopabcdefghijklmnop', {
        ...PROD_ENV,
        EXTENSION_ALLOWED_ORIGINS: 'abcdefghijklmnopabcdefghijklmnop',
      }),
    ).toBe(true);
  });

  it('accepts comma-separated allowlist with whitespace and trailing slashes', () => {
    expect(
      isAllowedExtensionOrigin('chrome-extension://abcdefghijklmnopabcdefghijklmnop', {
        ...PROD_ENV,
        EXTENSION_ALLOWED_ORIGINS:
          ' chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/, abcdefghijklmnopabcdefghijklmnop ',
      }),
    ).toBe(true);
  });

  it('rejects mixed-case env entries (no /i flag — fail loud on misconfig)', () => {
    // Chrome 永远生成全小写 ID。env 里配错的大小写应当场 reject，运维一眼看出。
    expect(
      isAllowedExtensionOrigin('chrome-extension://abcdefghijklmnopabcdefghijklmnop', {
        ...PROD_ENV,
        EXTENSION_ALLOWED_ORIGINS: 'ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP',
      }),
    ).toBe(false);
    expect(
      isAllowedExtensionOrigin('chrome-extension://abcdefghijklmnopabcdefghijklmnop', {
        ...PROD_ENV,
        EXTENSION_ALLOWED_ORIGINS: 'chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP',
      }),
    ).toBe(false);
  });

  it('rejects invalid ID format (wrong length / disallowed chars)', () => {
    expect(isAllowedExtensionOrigin('chrome-extension://tooshort', PROD_ENV)).toBe(false);
    // Chrome 扩展 ID 仅 a-p；q-z / 数字应被拒
    expect(
      isAllowedExtensionOrigin('chrome-extension://qzqzqzqzqzqzqzqzqzqzqzqzqzqzqzqz', PROD_ENV),
    ).toBe(false);
  });

  it('local wrangler dev allows any well-formed extension origin (unpacked dev keys)', () => {
    expect(
      isAllowedExtensionOrigin('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', DEV_ENV),
    ).toBe(true);
    expect(
      isAllowedExtensionOrigin('chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', DEV_ENV),
    ).toBe(true);
  });

  it('local wrangler dev still rejects non-extension origins', () => {
    expect(isAllowedExtensionOrigin('https://rewrite.so', DEV_ENV)).toBe(false);
  });
});
