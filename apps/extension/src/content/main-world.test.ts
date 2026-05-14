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
  const ContentStateClass: any = function () {};
  ContentStateClass.createFromText = vi.fn(() =>
    Object.assign(Object.create(ContentStateClass.prototype), finalContent),
  );
  if (opts.brokenContentClass) {
    ContentStateClass.createFromText = undefined;
  }

  // Mock Draft EditorState 类
  // biome-ignore lint/suspicious/noExplicitAny: mock fiber chain
  const EditorStateClass: any = function () {};
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
    const ok = replaceDraftEditor(el, 'hello world');
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
    expect(replaceDraftEditor(el, 'x')).toBe(false);
  });

  it('returns false when ContentState.createFromText is missing', () => {
    const { el, onChange } = buildMockDraftFiberDOM({ brokenContentClass: true });
    expect(replaceDraftEditor(el, 'x')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('returns false when EditorState static methods are missing', () => {
    const { el, onChange } = buildMockDraftFiberDOM({ brokenEditorClass: true });
    expect(replaceDraftEditor(el, 'x')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('catches throws inside reflection (never bubbles to caller)', () => {
    const { el, onChange } = buildMockDraftFiberDOM({ pushThrows: true });
    expect(replaceDraftEditor(el, 'x')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('returns false when fiber has editorState but no onChange', () => {
    const { el } = buildMockDraftFiberDOM({ noOnChange: true });
    expect(replaceDraftEditor(el, 'x')).toBe(false);
  });
});
