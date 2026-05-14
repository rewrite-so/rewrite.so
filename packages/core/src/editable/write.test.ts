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

  it('framework preventDefault does NOT halt our replacement', () => {
    // 关键回归测试：旧实现在 framework preventDefault 后 silent return，
    // 导致 controlled-tree 框架（Draft.js / Lexical）的 model 状态永不更新，
    // 用户后续 Backspace 与 DOM 解耦表现为"删不掉 / 删了又恢复"。
    // 新实现强制走完整链路，DOM 必被改且 input 事件必触发，给框架 reconcile 机会。
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    ce.textContent = 'original';
    document.body.appendChild(ce);

    // 模拟 framework：preventDefault beforeinput（Draft.js 的标准行为）
    ce.addEventListener('beforeinput', (e) => e.preventDefault());

    const onInput = vi.fn();
    ce.addEventListener('input', onInput);

    replaceEditable(ce, 'changed', 'all');

    // 新行为：即使 framework preventDefault，我们仍完成替换
    expect(ce.textContent).toContain('changed');
    // input 事件必触发（controlled framework 需要看到这个事件才能 reconcile model）
    expect(onInput).toHaveBeenCalledTimes(1);
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

  it('dispatched input event has composed:true (cross shadow boundary)', () => {
    // Reddit `<faceplate-textarea-input>` 等 Web Component 把真实输入框放
    // shadow DOM 内；写值后外层 React state 监听靠 composed:true 才能收到事件。
    // 这个测试用 contenteditable 但 composed 属性逻辑相同，覆盖 dispatch 配置。
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    ce.textContent = 'old';
    document.body.appendChild(ce);

    let beforeInputComposed = false;
    let inputComposed = false;
    ce.addEventListener('beforeinput', (e) => {
      beforeInputComposed = e.composed;
    });
    ce.addEventListener('input', (e) => {
      inputComposed = e.composed;
    });

    replaceEditable(ce, 'new', 'all');

    expect(beforeInputComposed).toBe(true);
    expect(inputComposed).toBe(true);
  });

  it('textarea input/change events have composed:true', () => {
    const ta = document.createElement('textarea');
    ta.value = 'old';
    document.body.appendChild(ta);

    let inputComposed = false;
    let changeComposed = false;
    ta.addEventListener('input', (e) => {
      inputComposed = e.composed;
    });
    ta.addEventListener('change', (e) => {
      changeComposed = e.composed;
    });

    replaceEditable(ta, 'new', 'all');

    expect(inputComposed).toBe(true);
    expect(changeComposed).toBe(true);
  });
});
