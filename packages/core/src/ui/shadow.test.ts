/// <reference lib="dom" />
import { afterEach, describe, expect, it } from 'vitest';
import { createShadowRoot, destroyShadowRoot } from './shadow.ts';

describe('shadow root lifecycle', () => {
  afterEach(() => {
    destroyShadowRoot();
    document.body.innerHTML = '';
  });

  it('reuses a closed shadow root through the module cache', () => {
    const first = createShadowRoot('closed');
    const second = createShadowRoot('closed');

    expect(second.host).toBe(first.host);
    expect(second.root).toBe(first.root);
    expect(first.host.shadowRoot).toBeNull();
  });

  it('can recreate a closed shadow host after destroy', () => {
    const first = createShadowRoot('closed');
    destroyShadowRoot();
    const second = createShadowRoot('closed');

    expect(second.host).not.toBe(first.host);
    expect(second.root).not.toBe(first.root);
  });
});
