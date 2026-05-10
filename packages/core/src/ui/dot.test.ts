/// <reference lib="dom" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDot } from './dot.ts';
import { createShadowRoot, destroyShadowRoot } from './shadow.ts';

interface MockResizeObserver {
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: () => void;
}

let lastObserver: MockResizeObserver | null = null;

beforeEach(() => {
  lastObserver = null;
  // happy-dom does not implement ResizeObserver; provide a controllable mock
  // class so tests can verify observe/disconnect calls and synthesize
  // size-change notifications.
  class MockRO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    trigger: () => void;
    constructor(cb: ResizeObserverCallback) {
      this.trigger = () =>
        cb([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
      lastObserver = this as unknown as MockResizeObserver;
    }
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockRO;
});

afterEach(() => {
  destroyShadowRoot();
  document.body.innerHTML = '';
  delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
});

function setup() {
  const { root } = createShadowRoot('open');
  const target = document.createElement('textarea');
  document.body.appendChild(target);
  // happy-dom returns 0x0 rect for unstyled elements; stub a real size
  target.getBoundingClientRect = () =>
    ({
      left: 100,
      top: 100,
      right: 200,
      bottom: 150,
      width: 100,
      height: 50,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  return { root, target };
}

describe('createDot', () => {
  it('show() positions the dot at target right-bottom and adds .visible', async () => {
    const { root, target } = setup();
    const dot = createDot(root, 'en');
    dot.show(target);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const dotEl = root.querySelector('.dot') as HTMLElement;
    expect(dotEl.classList.contains('visible')).toBe(true);
    // right(200) - SIZE(10) - OFFSET(6) = 184; bottom(150) - 10 - 6 = 134
    expect(dotEl.style.left).toBe('184px');
    expect(dotEl.style.top).toBe('134px');
  });

  it('show() observes the target with ResizeObserver', () => {
    const { root, target } = setup();
    const dot = createDot(root, 'en');
    dot.show(target);
    expect(lastObserver).not.toBeNull();
    expect(lastObserver?.observe).toHaveBeenCalledWith(target);
  });

  it('ResizeObserver callback re-positions the dot when target resizes', () => {
    const { root, target } = setup();
    const dot = createDot(root, 'en');
    dot.show(target);
    // simulate textarea growing taller
    target.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 100,
        right: 200,
        bottom: 250,
        width: 100,
        height: 150,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    lastObserver?.trigger();
    // requestAnimationFrame is async; flush it
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        const dotEl = root.querySelector('.dot') as HTMLElement;
        // bottom moved from 150 to 250: top = 250 - 10 - 6 = 234
        expect(dotEl.style.top).toBe('234px');
        resolve();
      });
    });
  });

  it('hide() disconnects the ResizeObserver', () => {
    const { root, target } = setup();
    const dot = createDot(root, 'en');
    dot.show(target);
    const observer = lastObserver;
    dot.hide();
    expect(observer?.disconnect).toHaveBeenCalled();
  });

  it('switching targets disconnects previous observer and observes new one', () => {
    const { root, target } = setup();
    const dot = createDot(root, 'en');
    dot.show(target);
    const firstObserver = lastObserver;

    const target2 = document.createElement('input');
    document.body.appendChild(target2);
    target2.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 50,
        bottom: 30,
        width: 50,
        height: 30,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    dot.show(target2);

    expect(firstObserver?.disconnect).toHaveBeenCalled();
    expect(lastObserver).not.toBe(firstObserver);
    expect(lastObserver?.observe).toHaveBeenCalledWith(target2);
  });

  it('destroy() removes dot/tooltip from DOM and disconnects observer', () => {
    const { root, target } = setup();
    const dot = createDot(root, 'en');
    dot.show(target);
    const observer = lastObserver;
    dot.destroy();
    expect(root.querySelector('.dot')).toBeNull();
    expect(root.querySelector('.dot-tooltip')).toBeNull();
    expect(observer?.disconnect).toHaveBeenCalled();
  });

  it('falls back gracefully when ResizeObserver is unavailable', async () => {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
    const { root, target } = setup();
    const dot = createDot(root, 'en');
    expect(() => dot.show(target)).not.toThrow();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const dotEl = root.querySelector('.dot') as HTMLElement;
    expect(dotEl.classList.contains('visible')).toBe(true);
  });
});
