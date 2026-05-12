import { describe, expect, it } from 'vitest';
import {
  type EventMetric,
  hashSubjectId,
  validateEventProps,
  writeEventPoint,
} from './event-metrics.ts';
import { hashUserId } from './metrics.ts';

function fakeDataset() {
  const points: Array<{ indexes: string[]; blobs: string[]; doubles: number[] }> = [];
  return {
    points,
    dataset: {
      writeDataPoint: (p: unknown) =>
        points.push(p as { indexes: string[]; blobs: string[]; doubles: number[] }),
    } as unknown as AnalyticsEngineDataset,
  };
}

describe('hashSubjectId', () => {
  it('returns undefined for anonymous_no_id kind', async () => {
    expect(await hashSubjectId('anonymous_no_id', undefined)).toBeUndefined();
    expect(await hashSubjectId('anonymous_no_id', 'something')).toBeUndefined();
  });

  it('returns undefined when raw is missing', async () => {
    expect(await hashSubjectId('user', undefined)).toBeUndefined();
    expect(await hashSubjectId('visitor', '')).toBeUndefined();
  });

  it("'user' kind uses hashUserId(raw) directly — JOIN-compatible with rewrite_requests", async () => {
    const direct = await hashUserId('user_abc');
    const subject = await hashSubjectId('user', 'user_abc');
    expect(subject).toBe(direct);
  });

  it("'visitor' kind uses an independent namespace, so user/visitor hashes for the same raw value never collide", async () => {
    const userHash = await hashSubjectId('user', 'shared_raw');
    const visitorHash = await hashSubjectId('visitor', 'shared_raw');
    expect(visitorHash).toMatch(/^[0-9a-f]{16}$/);
    expect(visitorHash).not.toBe(userHash);
  });
});

describe('validateEventProps', () => {
  it('treats undefined props as an empty JSON', () => {
    expect(validateEventProps(undefined)).toEqual({ ok: true, json: '' });
    expect(validateEventProps({})).toEqual({ ok: true, json: '' });
  });

  it('accepts string + number values within limits', () => {
    const r = validateEventProps({ style: 'casual', position: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.parse(r.json)).toEqual({ style: 'casual', position: 2 });
  });

  it('rejects more than MAX_PROPS_KEYS', () => {
    const props: Record<string, number> = {};
    for (let i = 0; i < 9; i++) props[`k${i}`] = i;
    expect(validateEventProps(props)).toEqual({ ok: false, error: 'too_many_keys' });
  });

  it.each([
    ['text'],
    ['content'],
    ['prompt'],
    ['output'],
    ['email'],
    ['ip'],
    ['password'],
    ['secret'],
    ['token'],
    ['apikey'],
    ['api_key'],
    ['user_email'],
    ['input_text'],
    ['raw_ip_address'],
  ])('rejects forbidden key substring "%s"', (key) => {
    expect(validateEventProps({ [key]: 'value' })).toEqual({
      ok: false,
      error: 'forbidden_key',
    });
  });

  it.each([
    ['1bad'],
    ['Bad'],
    ['has-dash'],
    ['has.dot'],
    ['has space'],
    [''],
  ])('rejects malformed key %s', (key) => {
    const r = validateEventProps({ [key]: 'x' });
    expect(r.ok).toBe(false);
  });

  it('rejects strings over MAX_PROP_STRING_LENGTH (50 chars)', () => {
    const r = validateEventProps({ tag: 'x'.repeat(51) });
    expect(r).toEqual({ ok: false, error: 'value_too_long' });
  });

  it.each([
    ['\n'],
    ['\r'],
    ['\t'],
    ['\x00'],
    ['"'],
    ['\\'],
    ['<'],
    ['>'],
    ['{'],
    [']'],
  ])('rejects forbidden character %j in values', (ch) => {
    const r = validateEventProps({ tag: `x${ch}y` });
    expect(r).toEqual({ ok: false, error: 'forbidden_value_char' });
  });

  it('rejects non-finite numbers (Infinity / NaN)', () => {
    expect(validateEventProps({ value: Number.POSITIVE_INFINITY })).toEqual({
      ok: false,
      error: 'non_finite_number',
    });
    expect(validateEventProps({ value: Number.NaN })).toEqual({
      ok: false,
      error: 'non_finite_number',
    });
  });

  it.each([
    ['boolean', true],
    ['null', null],
    ['undefined leaf', undefined],
    ['object', { nested: 1 }],
    ['array', [1, 2]],
  ])('rejects %s leaf values', (_label, val) => {
    const r = validateEventProps({ tag: val as unknown as string });
    expect(r).toEqual({ ok: false, error: 'invalid_value_type' });
  });

  it('rejects serialized JSON over MAX_PROPS_JSON_BYTES', () => {
    // 8 keys × 50-char values + JSON overhead crosses the 200-byte cap.
    const props: Record<string, string> = {};
    for (let i = 0; i < 8; i++) props[`k${i}`] = 'x'.repeat(50);
    expect(validateEventProps(props)).toEqual({ ok: false, error: 'props_json_too_large' });
  });
});

describe('writeEventPoint', () => {
  const baseMetric: EventMetric = {
    eventName: 'page_view',
    pagePath: '/try',
    locale: 'en',
    tier: 'anon',
    subjectKind: 'visitor',
    subjectIdHash: '0123456789abcdef',
  };

  it('does nothing when dataset binding is undefined (local wrangler dev)', () => {
    // The contract is "must never throw". Compiles + executes proves it.
    expect(() => writeEventPoint(undefined, baseMetric)).not.toThrow();
  });

  it('writes one data point with the documented blob layout', () => {
    const { dataset, points } = fakeDataset();
    writeEventPoint(dataset, {
      ...baseMetric,
      referrerHost: 'google.com',
      utm: { source: 'twitter', medium: 'social', campaign: 'launch' },
      country: 'US',
      deviceType: 'desktop',
      propsJson: '{"length_bucket":"<500"}',
      value: 42,
    });

    expect(points).toHaveLength(1);
    const p = points[0];
    if (!p) throw new Error('expected one data point');
    expect(p.indexes).toEqual(['page_view']);
    expect(p.blobs).toEqual([
      'page_view', // blob1
      '/try', // blob2
      'en', // blob3
      'google.com', // blob4
      'twitter', // blob5
      'social', // blob6
      'launch', // blob7
      'US', // blob8
      'desktop', // blob9
      'anon', // blob10
      'visitor', // blob11
      '0123456789abcdef', // blob12
      '{"length_bucket":"<500"}', // blob13
    ]);
    expect(p.doubles).toEqual([42]);
  });

  it('uses empty strings for optional fields', () => {
    const { dataset, points } = fakeDataset();
    writeEventPoint(dataset, baseMetric);
    expect(points).toHaveLength(1);
    const p = points[0];
    if (!p) throw new Error('expected one data point');
    expect(p.blobs[3]).toBe(''); // referrer_host
    expect(p.blobs[4]).toBe(''); // utm_source
    expect(p.blobs[7]).toBe(''); // country
    expect(p.blobs[8]).toBe(''); // device_type
    expect(p.blobs[12]).toBe(''); // event_props
    expect(p.doubles).toEqual([0]);
  });

  it('swallows binding-side errors (fire-and-forget contract)', () => {
    const throwingDataset = {
      writeDataPoint: () => {
        throw new Error('AE outage');
      },
    } as unknown as AnalyticsEngineDataset;
    expect(() => writeEventPoint(throwingDataset, baseMetric)).not.toThrow();
  });
});
