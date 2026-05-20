import { describe, expect, it } from 'vitest';
import { RewriteRequestSchema } from './api-contract.ts';

const baseReq = {
  text: 'hello',
  hasSelection: false,
  lang: 'en',
} as const;

describe('RewriteRequestSchema styles length', () => {
  it('accepts styles array with length 3 (initial trigger)', () => {
    const r = RewriteRequestSchema.safeParse({
      ...baseReq,
      styles: ['faithful', 'casual', 'formal'],
    });
    expect(r.success).toBe(true);
  });

  it('accepts styles array with length 2', () => {
    const r = RewriteRequestSchema.safeParse({
      ...baseReq,
      styles: ['faithful', 'casual'],
    });
    expect(r.success).toBe(true);
  });

  it('accepts styles array with length 1 (single-card regenerate)', () => {
    const r = RewriteRequestSchema.safeParse({
      ...baseReq,
      styles: ['casual'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty styles array', () => {
    const r = RewriteRequestSchema.safeParse({
      ...baseReq,
      styles: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects styles array with length > 3', () => {
    const r = RewriteRequestSchema.safeParse({
      ...baseReq,
      styles: ['faithful', 'casual', 'formal', 'faithful'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown style values', () => {
    const r = RewriteRequestSchema.safeParse({
      ...baseReq,
      styles: ['shakespearean'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty or overlong lang values', () => {
    expect(
      RewriteRequestSchema.safeParse({
        ...baseReq,
        lang: '',
        styles: ['faithful'],
      }).success,
    ).toBe(false);
    expect(
      RewriteRequestSchema.safeParse({
        ...baseReq,
        lang: 'x'.repeat(51),
        styles: ['faithful'],
      }).success,
    ).toBe(false);
  });
});

describe('RewriteRequestSchema regen field', () => {
  it('accepts regen: true (single-card regenerate)', () => {
    const r = RewriteRequestSchema.safeParse({ ...baseReq, styles: ['casual'], regen: true });
    expect(r.success).toBe(true);
  });

  it('accepts regen: false', () => {
    const r = RewriteRequestSchema.safeParse({ ...baseReq, styles: ['casual'], regen: false });
    expect(r.success).toBe(true);
  });

  it('accepts a first-send request without regen (optional)', () => {
    const r = RewriteRequestSchema.safeParse({
      ...baseReq,
      styles: ['faithful', 'casual', 'formal'],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.regen).toBeUndefined();
  });

  it('rejects non-boolean regen', () => {
    const r = RewriteRequestSchema.safeParse({ ...baseReq, styles: ['casual'], regen: 'yes' });
    expect(r.success).toBe(false);
  });
});
