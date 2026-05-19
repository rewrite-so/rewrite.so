/// <reference lib="dom" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isDraftEditor, requestDraftReplace } from './draft.ts';

// 用 AbortController 让每个测试注册的 window listener 在该测试结束时被解绑，
// 避免上一个测试的 listener 串到下一个测试。
let listenerAC: AbortController;
beforeEach(() => {
  listenerAC = new AbortController();
  // 模拟 main-world script 已 ready（attribute 跨 world 共享）。生产环境下
  // main-world.ts mount 时设这个 attribute；测试里手动设让 waitForMainWorldReady
  // 同步通过，不引入 500ms 等待。
  document.documentElement.setAttribute('data-rewrite-so-main-world-ready', '1');
});
afterEach(() => {
  listenerAC.abort();
  document.documentElement.removeAttribute('data-rewrite-so-main-world-ready');
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function listenReplace(handler: (ev: CustomEvent) => void) {
  window.addEventListener('rewrite-so:draft-replace', handler as EventListener, {
    signal: listenerAC.signal,
  });
}

describe('isDraftEditor', () => {
  it('matches .public-DraftEditor-content', () => {
    const el = document.createElement('div');
    el.className = 'public-DraftEditor-content notranslate';
    expect(isDraftEditor(el)).toBe(true);
  });

  it('matches element inside .DraftEditor-root ancestor', () => {
    const root = document.createElement('div');
    root.className = 'DraftEditor-root';
    const inner = document.createElement('div');
    inner.contentEditable = 'true';
    root.appendChild(inner);
    document.body.appendChild(root);
    expect(isDraftEditor(inner)).toBe(true);
  });

  it('does not match plain contenteditable', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    expect(isDraftEditor(el)).toBe(false);
  });

  it('does not match Lexical contenteditable', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.setAttribute('data-lexical-editor', 'true');
    expect(isDraftEditor(el)).toBe(false);
  });

  it('returns false for null / non-Element input', () => {
    expect(isDraftEditor(null)).toBe(false);
    expect(isDraftEditor(undefined)).toBe(false);
  });
});

describe('requestDraftReplace', () => {
  let el: HTMLElement;
  beforeEach(() => {
    el = document.createElement('div');
    el.className = 'public-DraftEditor-content';
    document.body.appendChild(el);
  });

  it('dispatches rewrite-so:draft-replace with marker + payload', async () => {
    const seen: CustomEvent[] = [];
    listenReplace((e) => {
      seen.push(e);
    });

    void requestDraftReplace(el, { newText: 'hello', range: 'all' });
    // flush microtask 让 waitForMainWorldReady 解析 + dispatch 真正发生
    await Promise.resolve();

    expect(seen).toHaveLength(1);
    const detail = seen[0]?.detail as {
      id: string;
      marker: string;
      payload: { newText: string; range: string };
    };
    expect(detail.payload.newText).toBe('hello');
    expect(detail.payload.range).toBe('all');
    expect(detail.marker).toBe('data-rewrite-so-draft-target');
    expect(typeof detail.id).toBe('string');
    // marker attribute 设到了目标元素上，main-world 通过它定位
    expect(el.getAttribute('data-rewrite-so-draft-target')).toBe(detail.id);
  });

  it('resolves true when main-world returns ok=true', async () => {
    listenReplace((e) => {
      const { id } = e.detail;
      // 模拟 main-world 处理后回响应
      window.dispatchEvent(
        new CustomEvent('rewrite-so:draft-replace-result', { detail: { id, ok: true } }),
      );
    });

    const result = await requestDraftReplace(el, { newText: 'x', range: 'all' });
    expect(result).toBe(true);
    // marker 应该被清理
    expect(el.hasAttribute('data-rewrite-so-draft-target')).toBe(false);
  });

  it('resolves false when main-world returns ok=false', async () => {
    listenReplace((e) => {
      const { id } = e.detail;
      window.dispatchEvent(
        new CustomEvent('rewrite-so:draft-replace-result', { detail: { id, ok: false } }),
      );
    });

    expect(await requestDraftReplace(el, { newText: 'x', range: 'all' })).toBe(false);
  });

  it('resolves false on timeout when main-world never responds', async () => {
    vi.useFakeTimers();
    // 不挂任何 listener —— 模拟 main-world script 没装上
    const p = requestDraftReplace(el, { newText: 'x', range: 'all' });
    // 用 async 版本同时处理 microtask（让 await waitForMainWorldReady resolve）+ timer
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toBe(false);
    // 即使超时也清理 marker
    expect(el.hasAttribute('data-rewrite-so-draft-target')).toBe(false);
  });

  it('ignores result events with mismatched id (no cross-talk)', async () => {
    listenReplace(() => {
      // 发一个 id 不匹配的 result（模拟旧 request 的迟到响应）
      window.dispatchEvent(
        new CustomEvent('rewrite-so:draft-replace-result', {
          detail: { id: 'wrong-id', ok: true },
        }),
      );
    });
    vi.useFakeTimers();
    const p = requestDraftReplace(el, { newText: 'x', range: 'all' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toBe(false); // timeout 兜底，不被 wrong-id 干扰
  });

  it('subsequent calls get unique ids', async () => {
    const ids: string[] = [];
    listenReplace((e) => {
      ids.push(e.detail.id);
    });
    void requestDraftReplace(el, { newText: 'a', range: 'all' });
    void requestDraftReplace(el, { newText: 'b', range: 'all' });
    // flush microtasks 让两次 await waitForMainWorldReady 都 resolve + dispatch
    await Promise.resolve();
    await Promise.resolve();
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('waits for main-world ready event when attribute not yet set', async () => {
    document.documentElement.removeAttribute('data-rewrite-so-main-world-ready');
    const seen: CustomEvent[] = [];
    listenReplace((e) => {
      seen.push(e);
    });

    const p = requestDraftReplace(el, { newText: 'x', range: 'all' });
    // 立刻还未 dispatch（在等 ready）
    await Promise.resolve();
    expect(seen).toHaveLength(0);

    // 模拟 main-world.ts 异步 ready
    document.documentElement.setAttribute('data-rewrite-so-main-world-ready', '1');
    window.dispatchEvent(new CustomEvent('rewrite-so:main-world-ready'));
    await Promise.resolve();

    expect(seen).toHaveLength(1);
    // cleanup：避免 p 挂着等结果
    window.dispatchEvent(
      new CustomEvent('rewrite-so:draft-replace-result', {
        detail: { id: seen[0]?.detail.id, ok: false },
      }),
    );
    await p;
  });
});
