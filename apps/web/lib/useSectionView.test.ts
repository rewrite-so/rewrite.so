import { describe, expect, it, vi } from 'vitest';

// Smoke test — we don't have jsdom/RTL so we can only assert that the module
// loads cleanly and the hook returns a ref object. Behavior tests (IO firing,
// dedup) require a DOM environment; that's a future investment when we add
// RTL.

describe('useSectionView', () => {
  it('module loads and exports a function', async () => {
    // Mock the track side-effect so the import graph is satisfied even though
    // we don't call the hook in this smoke test.
    vi.mock('./analytics.ts', () => ({ track: vi.fn() }));
    const mod = await import('./useSectionView.ts');
    expect(typeof mod.useSectionView).toBe('function');
  });
});
