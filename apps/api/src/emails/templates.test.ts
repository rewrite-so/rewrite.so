import { LOCALES, type Locale } from '@rewrite/shared';
import { describe, expect, it } from 'vitest';
import {
  day1Email,
  day7Email,
  day14Email,
  day30Email,
  type EmailRecipient,
  type EmailTemplate,
  welcomeEmail,
} from './templates.ts';

const RECIPIENT: EmailRecipient = {
  email: 'test@example.com',
  name: 'Alice',
  userId: 'user_123',
  unsubscribeToken: 'tok_abc',
};

const CTX = { webOrigin: 'https://rewrite.so' };

const TEMPLATES: Array<{
  name: string;
  build: (r: EmailRecipient, c: typeof CTX, l: Locale) => EmailTemplate;
}> = [
  { name: 'welcome', build: welcomeEmail },
  { name: 'day1', build: day1Email },
  { name: 'day7', build: day7Email },
  { name: 'day14', build: day14Email },
  { name: 'day30', build: day30Email },
];

describe('email templates × 7 locales', () => {
  for (const tpl of TEMPLATES) {
    for (const locale of LOCALES) {
      it(`${tpl.name} / ${locale}: returns non-empty subject + html + text`, () => {
        const out = tpl.build(RECIPIENT, CTX, locale);
        expect(out.subject, 'subject').toBeTruthy();
        expect(out.html.length, 'html length').toBeGreaterThan(100);
        expect(out.text.length, 'text length').toBeGreaterThan(50);
      });

      it(`${tpl.name} / ${locale}: html lang attribute matches locale`, () => {
        const out = tpl.build(RECIPIENT, CTX, locale);
        expect(out.html).toContain(`lang="${locale}"`);
      });

      it(`${tpl.name} / ${locale}: contains unsubscribe link`, () => {
        const out = tpl.build(RECIPIENT, CTX, locale);
        expect(out.html).toContain('/unsubscribe?');
        expect(out.text).toContain('/unsubscribe?');
      });
    }
  }
});

describe('locale-specific content sanity', () => {
  it('en welcome subject is English', () => {
    const out = welcomeEmail(RECIPIENT, CTX, 'en');
    expect(out.subject).toMatch(/Welcome/);
  });

  it('zh-CN welcome subject is Chinese', () => {
    const out = welcomeEmail(RECIPIENT, CTX, 'zh-CN');
    expect(out.subject).toContain('欢迎');
  });

  it('ja welcome subject is Japanese', () => {
    const out = welcomeEmail(RECIPIENT, CTX, 'ja');
    expect(out.subject).toContain('ようこそ');
  });

  it('ko / es / fr / de welcome subjects differ', () => {
    const subjects = (['ko', 'es', 'fr', 'de'] as const).map(
      (l) => welcomeEmail(RECIPIENT, CTX, l).subject,
    );
    // all distinct
    expect(new Set(subjects).size).toBe(4);
  });
});

describe('greeting injection', () => {
  it('en includes name when provided', () => {
    const out = welcomeEmail(RECIPIENT, CTX, 'en');
    expect(out.html).toContain('Alice');
  });

  it('zh-CN handles missing name (falls back to generic greeting)', () => {
    const out = welcomeEmail({ ...RECIPIENT, name: null }, CTX, 'zh-CN');
    expect(out.html).toContain('你好');
  });
});
