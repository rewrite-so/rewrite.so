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

// ============================================================================
// Plan v9: 渐进式降级 + Lexical/Draft 检测 + buildLexicalSelectionFullText
// ============================================================================

import { detectControlledEditor, isLexicalEditor } from './detect.ts';
import { buildLexicalSelectionFullText } from './write.ts';

describe('isLexicalEditor (cross-shadow detection)', () => {
  it('matches direct element with data-lexical-editor="true"', () => {
    const el = document.createElement('div');
    el.setAttribute('data-lexical-editor', 'true');
    expect(isLexicalEditor(el)).toBe(true);
  });

  it('matches nested element inside Lexical root', () => {
    const root = document.createElement('div');
    root.setAttribute('data-lexical-editor', 'true');
    const inner = document.createElement('span');
    root.appendChild(inner);
    document.body.appendChild(root);
    expect(isLexicalEditor(inner)).toBe(true);
  });

  it('does not match plain contenteditable', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    expect(isLexicalEditor(el)).toBe(false);
  });

  it('does not match Draft.js node', () => {
    const el = document.createElement('div');
    el.className = 'public-DraftEditor-content';
    expect(isLexicalEditor(el)).toBe(false);
  });

  it('returns false for null / undefined', () => {
    expect(isLexicalEditor(null)).toBe(false);
    expect(isLexicalEditor(undefined)).toBe(false);
  });
});

describe('detectControlledEditor', () => {
  it('detects Lexical', () => {
    const el = document.createElement('div');
    el.setAttribute('data-lexical-editor', 'true');
    expect(detectControlledEditor(el)).toBe('lexical');
  });

  it('detects Draft.js inner', () => {
    const el = document.createElement('div');
    el.className = 'public-DraftEditor-content';
    expect(detectControlledEditor(el)).toBe('draft');
  });

  it('detects Draft.js via ancestor', () => {
    const root = document.createElement('div');
    root.className = 'DraftEditor-root';
    const inner = document.createElement('div');
    root.appendChild(inner);
    document.body.appendChild(root);
    expect(detectControlledEditor(inner)).toBe('draft');
  });

  it('detects ProseMirror', () => {
    const el = document.createElement('div');
    el.className = 'ProseMirror';
    expect(detectControlledEditor(el)).toBe('prosemirror');
  });

  it('detects Slate', () => {
    const el = document.createElement('div');
    el.setAttribute('data-slate-editor', 'true');
    expect(detectControlledEditor(el)).toBe('slate');
  });

  it('returns null for plain contenteditable', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    expect(detectControlledEditor(el)).toBe(null);
  });
});

describe('buildLexicalSelectionFullText', () => {
  it('returns newText (fallback) when selection is not available', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'hello world';
    document.body.appendChild(el);
    // 没有 selection 设置 → fallback 返 newText
    expect(buildLexicalSelectionFullText(el, 'REPLACED')).toBe('REPLACED');
  });

  it('splices newText at selection range when selection is in element', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'hello world this is a test';
    document.body.appendChild(el);

    // 选中 'world'（offset 6-11）
    const tn = el.firstChild!;
    const range = document.createRange();
    range.setStart(tn, 6);
    range.setEnd(tn, 11);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const fullText = buildLexicalSelectionFullText(el, 'REPLACED');
    expect(fullText).toBe('hello REPLACED this is a test');
  });

  it('returns newText when selection is outside element', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'hello';
    document.body.appendChild(el);

    const outside = document.createElement('div');
    outside.textContent = 'other text';
    document.body.appendChild(outside);

    const range = document.createRange();
    range.setStart(outside.firstChild!, 0);
    range.setEnd(outside.firstChild!, 5);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    // selection 不在 el 内 → fallback newText
    expect(buildLexicalSelectionFullText(el, 'X')).toBe('X');
  });
});

describe('replaceEditable returns Promise<boolean>', () => {
  it('returns true on plain contenteditable (DOM path always succeeds)', async () => {
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    ce.textContent = 'old';
    document.body.appendChild(ce);

    const ok = await replaceEditable(ce, 'new', 'all');
    expect(ok).toBe(true);
    expect(ce.textContent).toContain('new');
  });

  it('returns true on textarea (sync form-field path)', async () => {
    const ta = document.createElement('textarea');
    ta.value = 'old';
    document.body.appendChild(ta);

    const ok = await replaceEditable(ta, 'new', 'all');
    expect(ok).toBe(true);
    expect(ta.value).toBe('new');
  });

  it('Lexical + range=all routes to lexical fallback (short-circuit, no DOM path)', async () => {
    // jsdom 下 main-world handler 不存在 → requestLexicalReplace 超时返 false
    // 短路 1 直接走 lexical fallback → 失败 → silent (返 false，不动 DOM)
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    ce.setAttribute('data-lexical-editor', 'true');
    ce.textContent = 'lexical content';
    document.body.appendChild(ce);
    document.documentElement.setAttribute('data-rewrite-so-main-world-ready', '1');

    let beforeInputDispatched = false;
    ce.addEventListener('beforeinput', () => {
      beforeInputDispatched = true;
    });

    const ok = await replaceEditable(ce, 'new', 'all');
    // 没有 main-world → 静默失败
    expect(ok).toBe(false);
    // 关键：未走通用 DOM 路径（否则会写 3 次 + 触发 beforeinput）
    expect(beforeInputDispatched).toBe(false);
    expect(ce.textContent).toBe('lexical content');

    document.documentElement.removeAttribute('data-rewrite-so-main-world-ready');
  }, 5000);
});

// ============================================================================
// Plan v9 fixup: P1-3 ProseMirror / Slate range='all' short-circuit
// ============================================================================

describe('PM / Slate range=all short-circuit (P1-3)', () => {
  it('ProseMirror + range=all goes to DOM path (not paste)', async () => {
    const ce = document.createElement('div');
    ce.className = 'ProseMirror';
    ce.contentEditable = 'true';
    ce.textContent = 'pm content';
    document.body.appendChild(ce);
    document.documentElement.setAttribute('data-rewrite-so-main-world-ready', '1');

    // 监听 paste 事件确认 paste 主路径**未被**调用
    let pasteCount = 0;
    ce.addEventListener('paste', () => {
      pasteCount++;
    });

    const ok = await replaceEditable(ce, 'new', 'all');
    // PM + all 短路走 DOM 路径 → execCommand insertText 整段替换；happy-dom
    // 没 execCommand 时走 DOM Range 兜底，仍替换为 'new'
    expect(ok).toBe(true);
    expect(pasteCount).toBe(0); // 关键：没走 paste 主路径
    expect(ce.textContent).toContain('new');

    document.documentElement.removeAttribute('data-rewrite-so-main-world-ready');
  });

  it('Slate + range=all goes to DOM path (not paste)', async () => {
    const ce = document.createElement('div');
    ce.setAttribute('data-slate-editor', 'true');
    ce.contentEditable = 'true';
    ce.textContent = 'slate content';
    document.body.appendChild(ce);
    document.documentElement.setAttribute('data-rewrite-so-main-world-ready', '1');

    let pasteCount = 0;
    ce.addEventListener('paste', () => {
      pasteCount++;
    });

    const ok = await replaceEditable(ce, 'new', 'all');
    expect(ok).toBe(true);
    expect(pasteCount).toBe(0);
    expect(ce.textContent).toContain('new');

    document.documentElement.removeAttribute('data-rewrite-so-main-world-ready');
  });
});

// ============================================================================
// Plan v9 fixup follow-up: PM + range='selection' 仍走 paste 主路径（不被 P1-3 短路误扩）
// ============================================================================

describe('PM / Slate range=selection boundary (P1-3 短路只对 all)', () => {
  // paste 主路径走 CustomEvent('rewrite-so:paste-replace') → main-world dispatch ClipboardEvent。
  // isolated world 端 spy 这个 CustomEvent 计数比 spy contenteditable 'paste' event 更准
  // （jsdom 下 main-world handler 不存在，contenteditable 端 paste 永远 0）。
  function spyPasteRequest() {
    const state = { count: 0 };
    const handler = () => {
      state.count++;
    };
    window.addEventListener('rewrite-so:paste-replace', handler);
    return {
      get count() {
        return state.count;
      },
      cleanup: () => window.removeEventListener('rewrite-so:paste-replace', handler),
    };
  }

  it('ProseMirror + range=selection still goes through paste main path (not DOM short-circuit)', async () => {
    const ce = document.createElement('div');
    ce.className = 'ProseMirror';
    ce.contentEditable = 'true';
    ce.textContent = 'pm content with selection';
    document.body.appendChild(ce);
    document.documentElement.setAttribute('data-rewrite-so-main-world-ready', '1');

    // 设真实 DOM selection 选中 'selection' 子串
    const tn = ce.firstChild!;
    const range = document.createRange();
    range.setStart(tn, 'pm content with '.length);
    range.setEnd(tn, 'pm content with selection'.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const spy = spyPasteRequest();
    try {
      // jsdom 下 main-world handler 不存在 → requestPasteReplace 超时返 false
      // → fallback 到 viaDom（PM 没专用反射 fallback）
      const ok = await replaceEditable(ce, 'NEW', 'selection');
      // 关键断言：paste 主路径**被尝试过**（短路 3 只对 range='all' 触发）
      expect(spy.count).toBe(1);
      expect(ok).toBe(true);
    } finally {
      spy.cleanup();
      document.documentElement.removeAttribute('data-rewrite-so-main-world-ready');
    }
  }, 5000);

  it('Slate + range=selection still goes through paste main path', async () => {
    const ce = document.createElement('div');
    ce.setAttribute('data-slate-editor', 'true');
    ce.contentEditable = 'true';
    ce.textContent = 'slate text with target';
    document.body.appendChild(ce);
    document.documentElement.setAttribute('data-rewrite-so-main-world-ready', '1');

    const tn = ce.firstChild!;
    const range = document.createRange();
    range.setStart(tn, 'slate text with '.length);
    range.setEnd(tn, 'slate text with target'.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const spy = spyPasteRequest();
    try {
      const ok = await replaceEditable(ce, 'NEW', 'selection');
      expect(spy.count).toBe(1);
      expect(ok).toBe(true);
    } finally {
      spy.cleanup();
      document.documentElement.removeAttribute('data-rewrite-so-main-world-ready');
    }
  }, 5000);

  it('ProseMirror + range=all does NOT go through paste main path (short-circuit verified)', async () => {
    const ce = document.createElement('div');
    ce.className = 'ProseMirror';
    ce.contentEditable = 'true';
    ce.textContent = 'pm content';
    document.body.appendChild(ce);
    document.documentElement.setAttribute('data-rewrite-so-main-world-ready', '1');

    const spy = spyPasteRequest();
    try {
      const ok = await replaceEditable(ce, 'new', 'all');
      // 短路 3 验证：range='all' 直接走 DOM 路径，paste 主路径**未被尝试**
      expect(spy.count).toBe(0);
      expect(ok).toBe(true);
      expect(ce.textContent).toContain('new');
    } finally {
      spy.cleanup();
      document.documentElement.removeAttribute('data-rewrite-so-main-world-ready');
    }
  });
});
