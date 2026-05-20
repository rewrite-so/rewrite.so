import { describe, expect, it } from 'vitest';
import { bucketInputLength } from './quotas.ts';

describe('bucketInputLength', () => {
  it('groups into 5 fixed buckets covering 0..4000', () => {
    expect(bucketInputLength(0)).toBe('<100');
    expect(bucketInputLength(99)).toBe('<100');
    expect(bucketInputLength(100)).toBe('<500');
    expect(bucketInputLength(499)).toBe('<500');
    expect(bucketInputLength(500)).toBe('<1000');
    expect(bucketInputLength(999)).toBe('<1000');
    expect(bucketInputLength(1000)).toBe('<2000');
    expect(bucketInputLength(2000)).toBe('<4000');
    expect(bucketInputLength(3999)).toBe('<4000');
  });
});
