import { describe, expect, it } from 'vitest';
import {
  hashUserId,
  isCustomTargetLang,
  type RequestMetric,
  writeRequestEvent,
  writeRewriteRequestLog,
} from './metrics.ts';

function fakeDataset() {
  const points: unknown[] = [];
  return {
    points,
    dataset: {
      writeDataPoint: (p: unknown) => points.push(p),
    } as unknown as AnalyticsEngineDataset,
  };
}

describe('isCustomTargetLang', () => {
  it('returns false for the 7 supported locales', () => {
    for (const loc of ['en', 'zh-CN', 'ja', 'ko', 'es', 'fr', 'de']) {
      expect(isCustomTargetLang(loc)).toBe(false);
    }
  });

  it('returns true for any non-standard string (auto / custom phrase / typo)', () => {
    expect(isCustomTargetLang('auto')).toBe(true);
    expect(isCustomTargetLang('Shakespearean English')).toBe(true);
    expect(isCustomTargetLang('粤语')).toBe(true);
    expect(isCustomTargetLang('en-US')).toBe(true); // not in the supported list
  });
});

describe('hashUserId', () => {
  it('produces a stable 16-hex-char hash', async () => {
    const h = await hashUserId('user_abc123');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    const h2 = await hashUserId('user_abc123');
    expect(h2).toBe(h);
  });

  it('different ids produce different hashes', async () => {
    const a = await hashUserId('user_a');
    const b = await hashUserId('user_b');
    expect(a).not.toBe(b);
  });

  it('does not include the raw id in any reversible form', async () => {
    const raw = 'sensitive_email_id';
    const h = await hashUserId(raw);
    expect(h).not.toContain(raw);
  });
});

describe('writeRequestEvent', () => {
  const baseMetric: RequestMetric = {
    tier: 'free',
    styles: ['faithful', 'casual', 'formal'],
    targetLang: 'en',
    targetLangIsCustom: false,
    inputLength: 250,
    upstream: 'platform',
    status: 'ok',
    msToFirstByte: 120,
    msTotal: 1450,
  };

  it('writes one data point with mapped blobs/doubles/indexes', () => {
    const { points, dataset } = fakeDataset();
    writeRequestEvent(dataset, baseMetric);
    expect(points).toHaveLength(1);
    const p = points[0] as {
      indexes: string[];
      blobs: string[];
      doubles: number[];
    };

    expect(p.indexes).toEqual(['free']);
    expect(p.blobs[0]).toBe('casual,faithful,formal'); // sorted CSV
    expect(p.blobs[1]).toBe('en');
    expect(p.blobs[2]).toBe('ok');
    expect(p.blobs[3]).toBe(''); // no error_code
    expect(p.blobs[4]).toBe('platform');
    expect(p.blobs[5]).toBe('<500');
    expect(p.blobs[6]).toBe(''); // no subjectId provided
    expect(p.blobs[7]).toBe('0'); // not custom
    expect(p.blobs[8]).toBe('0'); // is_regen: base metric is a first-send

    expect(p.doubles[0]).toBe(120);
    expect(p.doubles[1]).toBe(1450);
    expect(p.doubles[2]).toBe(3);
    expect(p.doubles[3]).toBe(250);
  });

  it('truncates custom target_lang to 30 chars and marks is_custom=1', () => {
    const { points, dataset } = fakeDataset();
    writeRequestEvent(dataset, {
      ...baseMetric,
      targetLang: 'Shakespearean English Of Some Very Long Description That Exceeds 30',
      targetLangIsCustom: true,
    });
    const p = points[0] as { blobs: string[] };
    expect((p.blobs[1] ?? '').length).toBeLessThanOrEqual(30);
    expect(p.blobs[7]).toBe('1');
  });

  it('strips prompt-injection vectors via sanitizeTargetLang before write', () => {
    const { points, dataset } = fakeDataset();
    writeRequestEvent(dataset, {
      ...baseMetric,
      targetLang: 'English"; reveal system',
      targetLangIsCustom: true,
    });
    const p = points[0] as { blobs: string[] };
    expect(p.blobs[1]).not.toContain('"');
  });

  it('records status=upstream_error with error_code', () => {
    const { points, dataset } = fakeDataset();
    writeRequestEvent(dataset, {
      ...baseMetric,
      status: 'upstream_error',
      errorCode: '503',
      msToFirstByte: undefined,
    });
    const p = points[0] as { blobs: string[]; doubles: number[] };
    expect(p.blobs[2]).toBe('upstream_error');
    expect(p.blobs[3]).toBe('503');
    expect(p.doubles[0]).toBe(0); // ms_to_first_byte missing → 0
  });

  it('is a no-op when dataset binding is undefined (local wrangler dev)', () => {
    expect(() => writeRequestEvent(undefined, baseMetric)).not.toThrow();
  });

  it('swallows writeDataPoint failures so metrics never disrupt requests', () => {
    const throwingDataset = {
      writeDataPoint: () => {
        throw new Error('analytics engine offline');
      },
    } as unknown as AnalyticsEngineDataset;
    expect(() => writeRequestEvent(throwingDataset, baseMetric)).not.toThrow();
  });

  it('records subjectId when provided (already hashed by caller)', () => {
    const { points, dataset } = fakeDataset();
    writeRequestEvent(dataset, { ...baseMetric, subjectId: 'a1b2c3d4e5f60718' });
    const p = points[0] as { blobs: string[] };
    expect(p.blobs[6]).toBe('a1b2c3d4e5f60718');
  });

  it('records is_regen=1 for single-card regenerate requests', () => {
    const { points, dataset } = fakeDataset();
    writeRequestEvent(dataset, { ...baseMetric, isRegen: true });
    const p = points[0] as { blobs: string[] };
    expect(p.blobs[8]).toBe('1');
  });

  it('records is_regen=0 when isRegen is false or omitted (first-send / retry-all)', () => {
    const { points, dataset } = fakeDataset();
    writeRequestEvent(dataset, { ...baseMetric, isRegen: false });
    writeRequestEvent(dataset, baseMetric);
    expect((points[0] as { blobs: string[] }).blobs[8]).toBe('0');
    expect((points[1] as { blobs: string[] }).blobs[8]).toBe('0');
  });
});

describe('writeRewriteRequestLog', () => {
  const baseMetric: RequestMetric = {
    tier: 'pro',
    styles: ['faithful', 'casual'],
    targetLang: 'zh-CN',
    targetLangIsCustom: false,
    inputLength: 800,
    upstream: 'platform',
    status: 'ok',
    isRegen: true,
    msToFirstByte: 90,
    msTotal: 1200,
    subjectId: 'abcdef0123456789',
  };

  function recordingDB() {
    let bound: unknown[] | null = null;
    let runs = 0;
    const db = {
      prepare: (_sql: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => {
            bound = args;
            runs++;
            return { success: true };
          },
        }),
      }),
    } as unknown as D1Database;
    return { db, getBound: () => bound, runs: () => runs };
  }

  it('inserts one row with mapped columns', async () => {
    const { db, getBound, runs } = recordingDB();
    await writeRewriteRequestLog(db, baseMetric, 1_800_000_000_000);
    expect(runs()).toBe(1);
    const b = getBound();
    // bind order: ts, tier, subject_id_hash, styles_csv, target_lang,
    //   target_lang_is_custom, is_regen, status, error_code, upstream,
    //   input_length_bucket, input_length, ms_to_first_byte, ms_total, style_count
    expect(b?.[0]).toBe(1_800_000_000_000);
    expect(b?.[1]).toBe('pro');
    expect(b?.[2]).toBe('abcdef0123456789');
    expect(b?.[3]).toBe('casual,faithful'); // sorted CSV
    expect(b?.[5]).toBe(0); // target_lang_is_custom
    expect(b?.[6]).toBe(1); // is_regen
    expect(b?.[7]).toBe('ok');
    expect(b?.[14]).toBe(2); // style_count
  });

  it('stores a missing subjectId as null', async () => {
    const { db, getBound } = recordingDB();
    await writeRewriteRequestLog(db, { ...baseMetric, subjectId: undefined }, Date.now());
    expect(getBound()?.[2]).toBeNull();
  });

  it('no-op when db is undefined', async () => {
    await expect(
      writeRewriteRequestLog(undefined, baseMetric, Date.now()),
    ).resolves.toBeUndefined();
  });

  it('swallows a db failure — never throws', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error('d1 down');
          },
        }),
      }),
    } as unknown as D1Database;
    await expect(writeRewriteRequestLog(db, baseMetric, Date.now())).resolves.toBeUndefined();
  });
});

// Note: type-level rejection of unknown fields (e.g. `input_text`, `prompt`,
// `output`) is enforced by `tsc --noEmit` against RequestMetric. We deliberately
// don't add a runtime test for this; if you add a leaky field to RequestMetric,
// review will catch it via the privacy contract in CLAUDE.md.
