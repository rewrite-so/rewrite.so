/// <reference lib="dom" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDraftEditorFiber, replaceDraftEditor } from './main-world.ts';

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * 构造一个 mock React fiber 链。Editor fiber 在 distanceFromBottom 层处。
 * 返回 DOM element（挂了 __reactFiber$mock 属性）+ onChange spy。
 */
function buildMockDraftFiberDOM(opts: {
  distanceFromBottom?: number;
  brokenContentClass?: boolean;
  brokenEditorClass?: boolean;
  pushThrows?: boolean;
  noOnChange?: boolean;
}) {
  const onChange = vi.fn();

  // Mock SelectionState - merge 返回带 overrides 的新对象（足够单测）
  const mergeSpy = vi.fn((overrides: Record<string, unknown>) => ({
    _merged: true,
    ...overrides,
  }));
  const mockSelection = { merge: mergeSpy };

  // Mock ContentBlock - 最后一个 block，键/长度供 selection 计算
  const mockLastBlock = {
    getKey: vi.fn(() => 'block-key-1'),
    getLength: vi.fn(() => 5),
  };

  // Mock Draft ContentState 类
  const finalContent = {
    getLastBlock: vi.fn(() => mockLastBlock),
  };
  // biome-ignore lint/suspicious/noExplicitAny: mock fiber chain
  // biome-ignore lint/complexity/useArrowFunction: needs `.prototype` slot — used by Object.create / setPrototypeOf below
  const ContentStateClass: any = function ContentStateClass() {};
  ContentStateClass.createFromText = vi.fn(() =>
    Object.assign(Object.create(ContentStateClass.prototype), finalContent),
  );
  if (opts.brokenContentClass) {
    ContentStateClass.createFromText = undefined;
  }

  // Mock Draft EditorState 类
  // biome-ignore lint/suspicious/noExplicitAny: mock fiber chain
  // biome-ignore lint/complexity/useArrowFunction: needs `.prototype` slot — used by Object.create / setPrototypeOf below
  const EditorStateClass: any = function EditorStateClass() {};
  EditorStateClass.push = opts.pushThrows
    ? vi.fn(() => {
        throw new Error('boom');
      })
    : vi.fn((es: unknown, content: unknown) => ({
        // push 返回带 getSelection 的对象（供 .merge 链路用）
        ...(es as Record<string, unknown>),
        _pushed: content,
        getSelection: () => mockSelection,
      }));
  EditorStateClass.forceSelection = vi.fn((es: unknown, sel: unknown) => ({
    ...(es as Record<string, unknown>),
    _forced: sel,
  }));
  if (opts.brokenEditorClass) {
    EditorStateClass.push = undefined;
  }

  const currentContent = Object.create(ContentStateClass.prototype);
  const editorState = {
    getCurrentContent: () => currentContent,
    getSelection: () => mockSelection,
  };
  Object.setPrototypeOf(editorState, EditorStateClass.prototype);
  EditorStateClass.prototype.constructor = EditorStateClass;
  ContentStateClass.prototype.constructor = ContentStateClass;

  // biome-ignore lint/suspicious/noExplicitAny: mock fiber chain
  const editorProps: any = { editorState };
  if (!opts.noOnChange) editorProps.onChange = onChange;

  // biome-ignore lint/suspicious/noExplicitAny: mock fiber chain
  const editorFiber: any = { memoizedProps: editorProps, return: null };

  let curFiber = editorFiber;
  const distance = opts.distanceFromBottom ?? 3;
  for (let i = 0; i < distance; i++) {
    curFiber = { memoizedProps: { unrelated: true }, return: curFiber };
  }

  const el = document.createElement('div');
  (el as unknown as Record<string, unknown>).__reactFiber$mockhash = curFiber;
  document.body.appendChild(el);

  return {
    el,
    onChange,
    EditorStateClass,
    ContentStateClass,
    mergeSpy,
    mockLastBlock,
  };
}

describe('findDraftEditorFiber', () => {
  it('finds Editor fiber by walking up .return chain', () => {
    const { el } = buildMockDraftFiberDOM({ distanceFromBottom: 5 });
    const hit = findDraftEditorFiber(el);
    expect(hit).not.toBeNull();
    expect(typeof hit?.props.onChange).toBe('function');
    expect(typeof hit?.props.editorState.getCurrentContent).toBe('function');
  });

  it('returns null when DOM has no __reactFiber$ attribute', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(findDraftEditorFiber(el)).toBeNull();
  });

  it('returns null when no fiber up the chain has editor-shaped props', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock fiber
    const fiber: any = {
      memoizedProps: { unrelated: 1 },
      return: { memoizedProps: { also: 'unrelated' }, return: null },
    };
    const el = document.createElement('div');
    (el as unknown as Record<string, unknown>).__reactFiber$abc = fiber;
    document.body.appendChild(el);
    expect(findDraftEditorFiber(el)).toBeNull();
  });

  it('safety counter prevents infinite loop on cyclic fiber.return', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock fiber
    const fiber: any = { memoizedProps: { unrelated: 1 } };
    fiber.return = fiber; // 自循环
    const el = document.createElement('div');
    (el as unknown as Record<string, unknown>).__reactFiber$cyc = fiber;
    document.body.appendChild(el);
    expect(findDraftEditorFiber(el)).toBeNull();
  });
});

describe('replaceDraftEditor', () => {
  it('calls onChange with new EditorState (selection forced to end) when fiber + classes are healthy', () => {
    const { el, onChange, ContentStateClass, EditorStateClass, mergeSpy, mockLastBlock } =
      buildMockDraftFiberDOM({});
    const ok = replaceDraftEditor(el, { newText: 'hello world', range: 'all' });
    expect(ok).toBe(true);
    expect(ContentStateClass.createFromText).toHaveBeenCalledWith('hello world');
    expect(EditorStateClass.push).toHaveBeenCalledTimes(1);
    // selection 构造：用 lastBlock.getKey() + lastBlock.getLength() merge 到末尾
    expect(mockLastBlock.getKey).toHaveBeenCalled();
    expect(mockLastBlock.getLength).toHaveBeenCalled();
    expect(mergeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorKey: 'block-key-1',
        anchorOffset: 5,
        focusKey: 'block-key-1',
        focusOffset: 5,
        hasFocus: true,
      }),
    );
    expect(EditorStateClass.forceSelection).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('returns false (silent fallback) when fiber lookup fails', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(replaceDraftEditor(el, { newText: 'x', range: 'all' })).toBe(false);
  });

  it('returns false when ContentState.createFromText is missing', () => {
    const { el, onChange } = buildMockDraftFiberDOM({ brokenContentClass: true });
    expect(replaceDraftEditor(el, { newText: 'x', range: 'all' })).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('returns false when EditorState static methods are missing', () => {
    const { el, onChange } = buildMockDraftFiberDOM({ brokenEditorClass: true });
    expect(replaceDraftEditor(el, { newText: 'x', range: 'all' })).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('catches throws inside reflection (never bubbles to caller)', () => {
    const { el, onChange } = buildMockDraftFiberDOM({ pushThrows: true });
    expect(replaceDraftEditor(el, { newText: 'x', range: 'all' })).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('returns false when fiber has editorState but no onChange', () => {
    const { el } = buildMockDraftFiberDOM({ noOnChange: true });
    expect(replaceDraftEditor(el, { newText: 'x', range: 'all' })).toBe(false);
  });
});

// ============================================================================
// Plan v9: replacePasteEditor + replaceLexicalEditor + Draft fast fallback
// ============================================================================

import { replacePasteEditor, replaceLexicalEditor } from './main-world.ts';

describe('replacePasteEditor (paste 主路径探针)', () => {
  it('strong signal: returns true when framework preventDefault is observed', async () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'before';
    document.body.appendChild(el);

    // 模拟 framework 接管 paste
    el.addEventListener('paste', (e) => e.preventDefault());

    const ok = await replacePasteEditor(el, {
      newText: 'NEW',
      range: 'all',
      selectionLength: 6,
    });
    expect(ok).toBe(true);
  });

  it('weak signal: returns true when textContent changes + contains newText prefix + length delta matches', async () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'before';
    document.body.appendChild(el);

    // 模拟 framework 不 preventDefault 但在 listener 内修改 DOM（整段替换语义）
    el.addEventListener('paste', (_e) => {
      el.textContent = 'NEW_TEXT_FROM_FRAMEWORK';
    });

    // selectionLength=6 模拟用户全选 'before'（lenDelta 校验：23-6=17 == 23-6=17 ✓）
    const ok = await replacePasteEditor(el, {
      newText: 'NEW_TEXT_FROM_FRAMEWORK',
      range: 'selection',
      selectionLength: 6,
    });
    expect(ok).toBe(true);
  });

  it('length delta check rejects partial-write false positive', async () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'Hello world, how are you?';
    document.body.appendChild(el);

    // 模拟 framework 部分写入：选了 'are you?' (8 chars) 改写成 'X' (1 char)
    // 但 framework 只写了 'X' 后没删原内容 → 'Hello world, how are you?X'（append）
    el.addEventListener('paste', (_e) => {
      el.textContent = 'Hello world, how are you?X';
    });

    const ok = await replacePasteEditor(el, {
      newText: 'X',  // 期望替换 'are you?'，结果只 append
      range: 'selection',
      selectionLength: 8,  // 'are you?'
    });
    // 期望 lenDelta = 26-25=1; expectedDelta = 1-8=-7; |1-(-7)|=8 > 3 → 返 false
    expect(ok).toBe(false);
  });

  it('returns false when textContent does not change (framework ignored paste)', async () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'before';
    document.body.appendChild(el);
    // 无 listener → dispatchedDefault === true + textContent 不变 → 返 false

    const ok = await replacePasteEditor(el, {
      newText: 'NEW',
      range: 'selection',
      selectionLength: 0,
    });
    expect(ok).toBe(false);
    expect(el.textContent).toBe('before');
  });

  it('returns false when textContent changes but does NOT contain newText (probe false positive guard)', async () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'before';
    document.body.appendChild(el);

    // 模拟 framework 改 DOM 但写错内容（不含 newText 前缀）
    el.addEventListener('paste', (_e) => {
      el.textContent = 'SOMETHING_ELSE';
    });

    const ok = await replacePasteEditor(el, {
      newText: 'NEW_TEXT',
      range: 'selection',
      selectionLength: 0,
    });
    expect(ok).toBe(false);
  });
});

describe('replaceLexicalEditor', () => {
  function buildMockLexicalDOM(opts: {
    hasEditor?: boolean;
    hasFastPath?: boolean;
    insertTextWorks?: boolean;
    setEditorStateWorks?: boolean;
  } = {}) {
    const {
      hasEditor = true,
      hasFastPath = false,
      insertTextWorks = true,
      setEditorStateWorks = true,
    } = opts;

    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.setAttribute('data-lexical-editor', 'true');
    document.body.appendChild(el);

    if (!hasEditor) {
      return { el, setEditorStateMock: null, insertTextMock: null };
    }

    const insertTextMock = vi.fn();
    const setEditorStateMock = vi.fn(() => {
      if (!setEditorStateWorks) throw new Error('setEditorState broken');
    });

    const editor = {
      update(fn: () => void) {
        fn();
      },
      getEditorState: () => ({
        toJSON: () => ({
          root: { children: [], direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 },
        }),
      }),
      parseEditorState: (_json: string) => ({}),
      setEditorState: setEditorStateMock,
      _pendingEditorState: hasFastPath
        ? {
            _selection: {
              insertText: (text: string) => {
                if (!insertTextWorks) throw new Error('insertText broken');
                insertTextMock(text);
              },
            },
          }
        : null,
    };

    (el as unknown as { __lexicalEditor: typeof editor }).__lexicalEditor = editor;
    return { el, setEditorStateMock, insertTextMock };
  }

  it('returns false when __lexicalEditor expando is missing', () => {
    const { el } = buildMockLexicalDOM({ hasEditor: false });
    const ok = replaceLexicalEditor(el, { newText: 'X', fullText: 'X', range: 'all' });
    expect(ok).toBe(false);
  });

  it('range=all goes directly to slow path (setEditorState)', () => {
    const { el, setEditorStateMock, insertTextMock } = buildMockLexicalDOM({ hasFastPath: true });
    const ok = replaceLexicalEditor(el, { newText: 'X', fullText: 'X', range: 'all' });
    expect(ok).toBe(true);
    expect(setEditorStateMock).toHaveBeenCalledTimes(1);
    expect(insertTextMock).not.toHaveBeenCalled();
  });

  it('range=selection uses fast path (insertText) when capability ok', () => {
    const { el, setEditorStateMock, insertTextMock } = buildMockLexicalDOM({ hasFastPath: true });
    const ok = replaceLexicalEditor(el, { newText: 'X', fullText: 'X', range: 'selection' });
    expect(ok).toBe(true);
    expect(insertTextMock).toHaveBeenCalledWith('X');
    // 应不调 setEditorState（fast path 命中）
    expect(setEditorStateMock).not.toHaveBeenCalled();
  });

  it('range=selection falls back to slow path when insertText throws', () => {
    const { el, setEditorStateMock } = buildMockLexicalDOM({
      hasFastPath: true,
      insertTextWorks: false,
    });
    const ok = replaceLexicalEditor(el, { newText: 'X', fullText: 'FULL', range: 'selection' });
    expect(ok).toBe(true);
    // fast path throw → slow path 接管
    expect(setEditorStateMock).toHaveBeenCalledTimes(1);
  });

  it('returns false when both fast and slow path fail', () => {
    const { el } = buildMockLexicalDOM({
      hasFastPath: true,
      insertTextWorks: false,
      setEditorStateWorks: false,
    });
    const ok = replaceLexicalEditor(el, { newText: 'X', fullText: 'X', range: 'selection' });
    expect(ok).toBe(false);
  });
});

describe('replaceDraftEditor fast fallback (Plan v9 新增)', () => {
  // Fast fallback (5+ immutable class 反射) 在现有 mock 下不可执行（mock selection
  // 没有 getStartKey/getStartOffset 等方法，反射会 throw）。验证：range='selection'
  // 时 fast path 自动 throw → fallback slow path → 整段 createFromText（与 range='all' 行为同）。
  // 完整 fast fallback 集成测试需要真实 immutable.js fixture，留给后续 e2e。
  it('range=selection falls back to slow path when fast reflection fails', () => {
    const { el, ContentStateClass, onChange } = buildMockDraftFiberDOM({});
    const ok = replaceDraftEditor(el, { newText: 'X', range: 'selection' });
    expect(ok).toBe(true);
    // fast path throw（mock selection 没 getStartKey 等）→ slow path 接管
    expect(ContentStateClass.createFromText).toHaveBeenCalledWith('X');
    expect(onChange).toHaveBeenCalled();
  });
});
