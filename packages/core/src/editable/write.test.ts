/// <reference lib="dom" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { replaceEditable } from './write.ts';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('replaceEditable — <input>/<textarea>', () => {
  it('replaces all in textarea + dispatches input event', () => {
    const ta = document.createElement('textarea');
    ta.value = 'hello';
    document.body.appendChild(ta);

    const onInput = vi.fn();
    ta.addEventListener('input', onInput);

    replaceEditable(ta, 'world', 'all');

    expect(ta.value).toBe('world');
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it('replaces selection only in textarea', () => {
    const ta = document.createElement('textarea');
    ta.value = 'hello world';
    document.body.appendChild(ta);
    ta.setSelectionRange(0, 5); // 'hello'

    replaceEditable(ta, 'goodbye', 'selection');
    expect(ta.value).toBe('goodbye world');
  });

  it('uses prototype setter (React-controlled compat)', () => {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = 'old';
    document.body.appendChild(inp);

    // 模拟 React：监听 prototype value accessor 的 set 调用
    const setterSpy = vi.spyOn(HTMLInputElement.prototype, 'value', 'set');

    replaceEditable(inp, 'new value', 'all');

    expect(setterSpy).toHaveBeenCalledWith('new value');
    expect(inp.value).toBe('new value');
    setterSpy.mockRestore();
  });
});

describe('replaceEditable — contenteditable', () => {
  it('beforeinput is dispatched with insertReplacementText', () => {
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    ce.textContent = 'hello';
    document.body.appendChild(ce);

    const seen: InputEvent[] = [];
    ce.addEventListener('beforeinput', (e) => seen.push(e as InputEvent));

    replaceEditable(ce, 'world', 'all');

    expect(seen).toHaveLength(1);
    expect(seen[0]?.inputType).toBe('insertReplacementText');
    expect(seen[0]?.data).toBe('world');
  });

  it('framework preventDefault halts our DOM mutation', () => {
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    ce.textContent = 'original';
    document.body.appendChild(ce);

    // 模拟 framework：preventDefault beforeinput
    ce.addEventListener('beforeinput', (e) => e.preventDefault());

    replaceEditable(ce, 'changed', 'all');

    // 我们不应再进行 DOM 操作（textContent 不变；framework 自己负责）
    expect(ce.textContent).toBe('original');
  });

  it('falls back to DOM mutation when framework does NOT handle', () => {
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    ce.textContent = 'old';
    document.body.appendChild(ce);

    // 不监听 beforeinput，让其通过；execCommand 在 happy-dom 下不可用，会走 DOM Range 兜底
    replaceEditable(ce, 'new', 'all');

    // 兜底应改 textContent（happy-dom 没 execCommand）
    expect(ce.textContent).toContain('new');
  });
});
