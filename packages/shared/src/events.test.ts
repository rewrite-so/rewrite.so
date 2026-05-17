import { describe, expect, it } from 'vitest';
import {
  EVENT_LIMITS,
  EVENT_NAMES,
  EventPayloadSchema,
  EventsBatchSchema,
  isEventName,
} from './events.ts';

describe('events whitelist', () => {
  it('contains every event named in the plan', () => {
    expect(EVENT_NAMES).toEqual([
      'page_view',
      'cta_click',
      'try_input',
      'try_select_candidate',
      'try_regenerate',
      'try_copy_result',
      'settings_change',
      'signin_attempt',
      'signin_success',
      'signout',
      'checkout_start',
      'subscription_paid',
      'subscription_canceled',
      'byok_save',
      'campaign_join',
      // Landing v2 funnel events — section_view wired today, the other four
      // are declared with no call sites yet (see events.ts DEFERRED notes).
      'section_view',
      'hero_demo_played',
      'compare_row_expand',
      'pricing_card_focus',
      'early_bird_banner_click',
    ]);
  });

  it('isEventName accepts whitelisted names only', () => {
    expect(isEventName('page_view')).toBe(true);
    expect(isEventName('subscription_paid')).toBe(true);
    expect(isEventName('not_a_real_event')).toBe(false);
    expect(isEventName('')).toBe(false);
    expect(isEventName(null)).toBe(false);
    expect(isEventName(42)).toBe(false);
  });

  it('limits match the privacy / cost contract', () => {
    expect(EVENT_LIMITS.MAX_EVENTS_PER_REQUEST).toBe(20);
    expect(EVENT_LIMITS.MAX_PROPS_KEYS).toBe(8);
    expect(EVENT_LIMITS.MAX_PROP_STRING_LENGTH).toBe(50);
    expect(EVENT_LIMITS.MAX_PROPS_JSON_BYTES).toBe(200);
  });
});

describe('EventPayloadSchema', () => {
  const validBase = {
    name: 'page_view' as const,
    ts: 1715600000000,
    page: '/try',
    locale: 'en',
  };

  it('accepts a minimal valid payload', () => {
    expect(EventPayloadSchema.safeParse(validBase).success).toBe(true);
  });

  it('accepts a full payload with utm + props', () => {
    const r = EventPayloadSchema.safeParse({
      ...validBase,
      referrer_host: 'google.com',
      utm: { source: 'twitter', medium: 'social', campaign: 'launch_v1' },
      visitor_id: 'uuid-abc',
      device_type: 'desktop',
      props: { length_bucket: '<500', lang: 'en' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown event name', () => {
    const r = EventPayloadSchema.safeParse({ ...validBase, name: 'mystery_event' });
    expect(r.success).toBe(false);
  });

  it('rejects nested objects inside props', () => {
    const r = EventPayloadSchema.safeParse({
      ...validBase,
      props: { nested: { foo: 'bar' } },
    });
    expect(r.success).toBe(false);
  });

  it('rejects array values inside props', () => {
    const r = EventPayloadSchema.safeParse({
      ...validBase,
      props: { items: ['a', 'b'] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects boolean values inside props (must be string or number)', () => {
    const r = EventPayloadSchema.safeParse({
      ...validBase,
      props: { is_first_visit: true },
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown device_type', () => {
    const r = EventPayloadSchema.safeParse({ ...validBase, device_type: 'watch' });
    expect(r.success).toBe(false);
  });
});

describe('EventsBatchSchema', () => {
  const ev = {
    name: 'page_view' as const,
    ts: 1715600000000,
    page: '/',
    locale: 'en',
  };

  it('accepts batch of 1', () => {
    expect(EventsBatchSchema.safeParse({ events: [ev] }).success).toBe(true);
  });

  it('accepts batch up to MAX_EVENTS_PER_REQUEST', () => {
    const events = Array.from({ length: EVENT_LIMITS.MAX_EVENTS_PER_REQUEST }, () => ev);
    expect(EventsBatchSchema.safeParse({ events }).success).toBe(true);
  });

  it('rejects batch over MAX_EVENTS_PER_REQUEST', () => {
    const events = Array.from({ length: EVENT_LIMITS.MAX_EVENTS_PER_REQUEST + 1 }, () => ev);
    expect(EventsBatchSchema.safeParse({ events }).success).toBe(false);
  });

  it('rejects empty batch', () => {
    expect(EventsBatchSchema.safeParse({ events: [] }).success).toBe(false);
  });
});
