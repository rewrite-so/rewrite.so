import { describe, expect, it } from 'vitest';
import {
  CampaignI18nSchema,
  CampaignSlugSchema,
  CampaignWriteSchema,
  EarlyBirdConfigSchema,
  getCampaignConfigSchema,
} from './campaigns.ts';

const VALID_EARLY_BIRD_CONFIG = {
  perks: {
    gift_days: 90,
    discount: {
      code: 'EARLYBIRD_LIFETIME_70OFF',
      percentage: 70,
      duration: 'forever' as const,
      grace_period_days: 60,
    },
  },
  require_login: true as const,
};

const VALID_I18N = {
  en: { title: 'Early Bird' },
  'zh-CN': { title: '早鸟计划' },
};

describe('EarlyBirdConfigSchema', () => {
  it('accepts a well-formed config', () => {
    expect(EarlyBirdConfigSchema.safeParse(VALID_EARLY_BIRD_CONFIG).success).toBe(true);
  });

  it('rejects gift_days = 0 (must be positive)', () => {
    const cfg = { ...VALID_EARLY_BIRD_CONFIG };
    cfg.perks = { ...cfg.perks, gift_days: 0 };
    expect(EarlyBirdConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('rejects percentage out of 1-99 range', () => {
    for (const bad of [0, 100, -5]) {
      const cfg = { ...VALID_EARLY_BIRD_CONFIG };
      cfg.perks = {
        ...cfg.perks,
        discount: { ...cfg.perks.discount, percentage: bad },
      };
      expect(EarlyBirdConfigSchema.safeParse(cfg).success).toBe(false);
    }
  });

  it('rejects discount.code with lowercase / spaces / special chars', () => {
    for (const bad of ['lowercase', 'WITH SPACES', 'WITH-DASH', '']) {
      const cfg = { ...VALID_EARLY_BIRD_CONFIG };
      cfg.perks = {
        ...cfg.perks,
        discount: { ...cfg.perks.discount, code: bad },
      };
      expect(EarlyBirdConfigSchema.safeParse(cfg).success).toBe(false);
    }
  });

  it('rejects duration outside the enum', () => {
    const cfg = { ...VALID_EARLY_BIRD_CONFIG };
    // @ts-expect-error testing invalid duration on purpose
    cfg.perks = { ...cfg.perks, discount: { ...cfg.perks.discount, duration: 'lifetime' } };
    expect(EarlyBirdConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('rejects require_login = false (Phase 1 must be true)', () => {
    expect(
      EarlyBirdConfigSchema.safeParse({ ...VALID_EARLY_BIRD_CONFIG, require_login: false }).success,
    ).toBe(false);
  });
});

describe('CampaignI18nSchema', () => {
  it('accepts en-only payload (other locales optional)', () => {
    expect(CampaignI18nSchema.safeParse({ en: { title: 'X' } }).success).toBe(true);
  });

  it('accepts multiple locales', () => {
    expect(CampaignI18nSchema.safeParse(VALID_I18N).success).toBe(true);
  });

  it('rejects payload missing en (fallback locale required)', () => {
    expect(CampaignI18nSchema.safeParse({ 'zh-CN': { title: '早鸟' } }).success).toBe(false);
  });

  it('rejects per-locale block with empty title', () => {
    expect(CampaignI18nSchema.safeParse({ en: { title: '' } }).success).toBe(false);
  });
});

describe('CampaignSlugSchema', () => {
  it('accepts lowercase kebab-case', () => {
    expect(CampaignSlugSchema.safeParse('early-bird').success).toBe(true);
    expect(CampaignSlugSchema.safeParse('early-bird-2026').success).toBe(true);
    expect(CampaignSlugSchema.safeParse('a1').success).toBe(true);
  });

  it('rejects uppercase / underscore / leading dash / empty', () => {
    for (const bad of ['EarlyBird', 'early_bird', '-early-bird', '', 'foo bar']) {
      expect(CampaignSlugSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('CampaignWriteSchema', () => {
  it('accepts a valid envelope (config_json is raw object — secondary parse via getCampaignConfigSchema)', () => {
    const result = CampaignWriteSchema.safeParse({
      type: 'early_bird',
      slug: 'early-bird',
      enabled: true,
      starts_at: 1700000000000,
      ends_at: 1800000000000,
      capacity: 5000,
      config_json: VALID_EARLY_BIRD_CONFIG,
      i18n_json: VALID_I18N,
    });
    expect(result.success).toBe(true);
  });

  it('accepts capacity = null (unlimited)', () => {
    expect(
      CampaignWriteSchema.safeParse({
        type: 'early_bird',
        slug: 'early-bird',
        enabled: false,
        starts_at: 0,
        ends_at: 0,
        capacity: null,
        config_json: VALID_EARLY_BIRD_CONFIG,
        i18n_json: VALID_I18N,
      }).success,
    ).toBe(true);
  });

  it('defaults show_homepage_badge to false when omitted (backward-compat with pre-0010 rows)', () => {
    const result = CampaignWriteSchema.safeParse({
      type: 'early_bird',
      slug: 'early-bird',
      enabled: true,
      starts_at: 1700000000000,
      ends_at: 1800000000000,
      capacity: null,
      config_json: VALID_EARLY_BIRD_CONFIG,
      i18n_json: VALID_I18N,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.show_homepage_badge).toBe(false);
    }
  });

  it('accepts show_homepage_badge = true', () => {
    const result = CampaignWriteSchema.safeParse({
      type: 'early_bird',
      slug: 'early-bird',
      enabled: true,
      show_homepage_badge: true,
      starts_at: 1700000000000,
      ends_at: 1800000000000,
      capacity: null,
      config_json: VALID_EARLY_BIRD_CONFIG,
      i18n_json: VALID_I18N,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.show_homepage_badge).toBe(true);
    }
  });

  it('rejects non-boolean show_homepage_badge', () => {
    expect(
      CampaignWriteSchema.safeParse({
        type: 'early_bird',
        slug: 'early-bird',
        enabled: true,
        show_homepage_badge: 'yes',
        starts_at: 1,
        ends_at: 2,
        capacity: null,
        config_json: VALID_EARLY_BIRD_CONFIG,
        i18n_json: VALID_I18N,
      }).success,
    ).toBe(false);
  });
});

describe('getCampaignConfigSchema', () => {
  it('dispatches early_bird to EarlyBirdConfigSchema', () => {
    expect(getCampaignConfigSchema('early_bird').safeParse(VALID_EARLY_BIRD_CONFIG).success).toBe(
      true,
    );
  });
});
