/// <reference lib="dom" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachDoubleShift } from './double-shift.ts';

function shiftDown(opts: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Shift', bubbles: true, ...opts });
}
function shiftUp(opts: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keyup', { key: 'Shift', bubbles: true, ...opts });
}
function key(name: string, type: 'keydown' | 'keyup' = 'keydown'): KeyboardEvent {
  return new KeyboardEvent(type, { key: name, bubbles: true });
}

describe('attachDoubleShift', () => {
  let onTrigger: ReturnType<typeof vi.fn<(event: KeyboardEvent) => void>>;
  let handle: { detach: () => void };

  beforeEach(() => {
    onTrigger = vi.fn<(event: KeyboardEvent) => void>();
    handle = attachDoubleShift(window, { onTrigger });
  });

  afterEach(() => {
    handle.detach();
    vi.useRealTimers();
  });

  it('triggers on Shift, Shift within 500ms', () => {
    window.dispatchEvent(shiftDown());
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown());
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger if interval > windowMs', async () => {
    handle.detach();
    handle = attachDoubleShift(window, {
      onTrigger: onTrigger as (e: KeyboardEvent) => void,
      windowMs: 10,
    });

    window.dispatchEvent(shiftDown());
    window.dispatchEvent(shiftUp());
    await new Promise((r) => setTimeout(r, 30));
    window.dispatchEvent(shiftDown());

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does NOT trigger if first Shift never released (capslock-mode)', () => {
    window.dispatchEvent(shiftDown());
    // 没有 keyup
    window.dispatchEvent(shiftDown());
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('ignores e.repeat (OS auto-repeat)', () => {
    window.dispatchEvent(shiftDown({ repeat: true }));
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown({ repeat: true }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does NOT trigger when Ctrl is held', () => {
    window.dispatchEvent(shiftDown({ ctrlKey: true }));
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown({ ctrlKey: true }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does NOT trigger when Alt is held', () => {
    window.dispatchEvent(shiftDown({ altKey: true }));
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown({ altKey: true }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does NOT trigger when Meta is held', () => {
    window.dispatchEvent(shiftDown({ metaKey: true }));
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown({ metaKey: true }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('Shift→A→Shift does NOT trigger (typing pattern)', () => {
    window.dispatchEvent(shiftDown());
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(key('A'));
    window.dispatchEvent(shiftDown());
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does NOT trigger during composition (IME)', () => {
    window.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.dispatchEvent(shiftDown());
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown());
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('triggers again after compositionend', () => {
    window.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    window.dispatchEvent(shiftDown());
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown());
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('respects e.isComposing flag too', () => {
    window.dispatchEvent(shiftDown({ isComposing: true }));
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown({ isComposing: true }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('detach removes listeners', () => {
    handle.detach();
    window.dispatchEvent(shiftDown());
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown());
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('left and right Shift treated equivalently', () => {
    // KeyboardEvent.location 不被检查
    window.dispatchEvent(shiftDown({ location: 1 })); // left
    window.dispatchEvent(shiftUp({ location: 1 }));
    window.dispatchEvent(shiftDown({ location: 2 })); // right
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('can trigger multiple times in sequence', () => {
    window.dispatchEvent(shiftDown());
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown());
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown());
    window.dispatchEvent(shiftUp());
    window.dispatchEvent(shiftDown());
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });
});
