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
});
