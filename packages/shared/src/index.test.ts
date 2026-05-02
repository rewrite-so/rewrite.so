import { describe, expect, it } from 'vitest';
import { ALL_STYLES, LOCALES, MAX_INPUT_CHARS, QUOTA, STYLE_LABEL } from './index.ts';

describe('shared constants', () => {
  it('exposes 3 styles in fixed order', () => {
    expect(ALL_STYLES).toEqual(['faithful', 'casual', 'formal']);
  });

  it('has labels for every style × every locale', () => {
    for (const s of ALL_STYLES) {
      for (const locale of LOCALES) {
        expect(STYLE_LABEL[s][locale], `${s}.${locale}`).toBeTruthy();
      }
    }
  });

  it('caps input at 4000 chars', () => {
    expect(MAX_INPUT_CHARS).toBe(4000);
  });

  it('quota is monthly: 10 / 5 / 30 / 2000', () => {
    expect(QUOTA.anonymousIp).toBe(10);
    expect(QUOTA.anonymousInstall).toBe(5);
    expect(QUOTA.loggedInFree).toBe(30);
    expect(QUOTA.pro).toBe(2000);
  });
});
