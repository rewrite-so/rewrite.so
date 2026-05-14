/**
 * Main-world content script —— 跑在页面 JS context（不是 isolated world），
 * 能访问 React 挂在 DOM element 上的 `__reactFiber$xxx` expando 属性。
 *
 * 为什么需要这个独立 entry：
 *   Chrome MV3 content script 默认跑在 isolated world——共享 DOM 结构，但
 *   **看不到页面 JS 在 element 上设置的自定义属性**（包括 React fiber expando）。
 *   要让 Draft.js 适配器能找到 EditorState 必须走 main world。manifest 中用
 *   `world: 'MAIN'` 字段（Chrome 102+）声明此 entry 跑在 main world。
 *
 * 通信协议（CustomEvent on window）：
 *   - 入：`rewrite-so:draft-replace` { detail: { id, marker, newText } }
 *     marker 是临时 data-attribute 名（如 'data-rewrite-so-target'），值是 id。
 *     main-world 通过 `[marker="id"]` 查找目标元素（不能跨 world 传 DOM 引用）。
 *   - 出：`rewrite-so:draft-replace-result` { detail: { id, ok } }
 *     ok=true 表示已调到 props.onChange；ok=false 表示 fiber 找不到 / 反射失败。
 *
 * 失败契约：静默不写 DOM —— Draft.js 受控树，外部改 DOM 会被立即 reconcile，
 *   留下"DOM 改了 model 没改"的崩溃态。失败 = 浮层关闭但内容不变（更安全）。
 */

interface ReplaceRequestDetail {
  id: string;
  marker: string;
  newText: string;
}

interface DraftFiberHit {
  props: {
    editorState: DraftEditorStateLike;
    onChange: (next: DraftEditorStateLike) => void;
  };
}

interface DraftEditorStateLike {
  getCurrentContent(): DraftContentStateLike;
  getSelection(): DraftSelectionStateLike;
  constructor: {
    push(es: DraftEditorStateLike, cs: DraftContentStateLike, ct: string): DraftEditorStateLike;
    /** 设置 selection 并标记 forceSelection 让 Draft 必须把它同步到 DOM */
    forceSelection(es: DraftEditorStateLike, sel: DraftSelectionStateLike): DraftEditorStateLike;
  };
}

interface DraftContentStateLike {
  getLastBlock(): DraftContentBlockLike;
  constructor: {
    createFromText(text: string, delimiter?: string): DraftContentStateLike;
  };
}

interface DraftContentBlockLike {
  getKey(): string;
  getLength(): number;
}

interface DraftSelectionStateLike {
  merge(props: Record<string, unknown>): DraftSelectionStateLike;
}

function getReactFiber(el: Element): unknown {
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
      return (el as unknown as Record<string, unknown>)[key];
    }
  }
  return null;
}

/**
 * 沿 fiber.return 链向上找 Draft Editor 的 fiber 节点（最多 50 步避免死循环）。
 * 判定特征：memoizedProps 含 editorState（带 getCurrentContent 方法）+ onChange function。
 * @internal exported for unit tests
 */
export function findDraftEditorFiber(el: Element): DraftFiberHit | null {
  const startFiber = getReactFiber(el);
  if (!startFiber) return null;
  let cur = startFiber as {
    return?: unknown;
    memoizedProps?: unknown;
    pendingProps?: unknown;
  };
  let safety = 50;
  while (cur && safety > 0) {
    safety--;
    const props =
      (cur.memoizedProps as Record<string, unknown> | undefined) ??
      (cur.pendingProps as Record<string, unknown> | undefined);
    if (
      props &&
      typeof props.onChange === 'function' &&
      props.editorState &&
      typeof (props.editorState as { getCurrentContent?: unknown }).getCurrentContent === 'function'
    ) {
      return { props: props as DraftFiberHit['props'] };
    }
    cur = (cur.return ?? null) as typeof cur;
  }
  return null;
}

/**
 * 通过 React fiber 替换 Draft.js 编辑器内容。
 * 成功返回 true（onChange 已调用，Draft 会 re-render）；失败返回 false（不动 DOM）。
 * @internal exported for unit tests
 */
export function replaceDraftEditor(el: Element, newText: string): boolean {
  try {
    const hit = findDraftEditorFiber(el);
    if (!hit) return false;
    const { props } = hit;
    const editorState = props.editorState;
    const currentContent = editorState.getCurrentContent();
    const ContentStateClass = currentContent.constructor;
    const EditorStateClass = editorState.constructor;
    if (
      typeof ContentStateClass?.createFromText !== 'function' ||
      typeof EditorStateClass?.push !== 'function' ||
      typeof EditorStateClass?.forceSelection !== 'function'
    ) {
      return false;
    }
    const newContent = ContentStateClass.createFromText(newText);
    const pushed = EditorStateClass.push(editorState, newContent, 'insert-characters');

    // 光标定位到新文本末尾。
    //   - newContent.getSelectionAfter() 默认指向第一 block offset 0（开头），
    //     直接用会让光标到开头 → 用户体验差。
    //   - EditorState.moveSelectionToEnd 内部走 acceptSelection（forceSelection=false），
    //     X 的 wrapper 接 onChange 后**可能**忽略软 selection 不 sync 到 DOM。
    //   - 这里显式构造末尾 SelectionState + 用 forceSelection（强制 DOM sync）。
    const lastBlock = newContent.getLastBlock();
    if (typeof lastBlock?.getKey !== 'function' || typeof lastBlock?.getLength !== 'function') {
      // ContentBlock API 不可用：兜底 fire onChange 但不调 selection（光标错位但内容对）
      props.onChange(pushed);
      return true;
    }
    const endKey = lastBlock.getKey();
    const endOffset = lastBlock.getLength();
    // SelectionState 是 immutable.Record，pushed.getSelection() 返回的 instance
    // 上有 merge 方法，传 plain object 拿一个新 instance（标准 immutable API）。
    const endSelection = pushed.getSelection().merge({
      anchorKey: endKey,
      anchorOffset: endOffset,
      focusKey: endKey,
      focusOffset: endOffset,
      isBackward: false,
      hasFocus: true,
    });
    const moved = EditorStateClass.forceSelection(pushed, endSelection);
    props.onChange(moved);
    return true;
  } catch {
    return false;
  }
}

function handleReplaceRequest(ev: Event): void {
  const detail = (ev as CustomEvent<ReplaceRequestDetail>).detail;
  if (!detail || typeof detail.id !== 'string') return;
  const { id, marker, newText } = detail;
  let ok = false;
  try {
    // 跨 world 传 DOM 引用是不行的 —— 用临时 data-attribute 标记定位目标元素
    const el = document.querySelector(`[${marker}="${CSS.escape(id)}"]`);
    if (el && typeof newText === 'string') {
      ok = replaceDraftEditor(el, newText);
    }
  } catch {
    /* swallow */
  }
  window.dispatchEvent(new CustomEvent('rewrite-so:draft-replace-result', { detail: { id, ok } }));
}

/**
 * 向 isolated world 广播 main-world 已 ready。
 *
 * - 通过 documentElement 上的 `data-rewrite-so-main-world-ready` attribute（DOM
 *   跨 world 共享）让 isolated 侧能**同步**检查 ready 状态——避免每次都等异步事件。
 * - 同时 dispatch 一次性 CustomEvent，给"draft.ts 模块在 main-world.ts 之前注册了
 *   listener 但当时还没 ready"的场景一个 push 通知。
 */
function announceReady(): void {
  try {
    document.documentElement.setAttribute('data-rewrite-so-main-world-ready', '1');
  } catch {
    /* documentElement 暂不可用 — 极罕见，dispatch 仍走 */
  }
  window.dispatchEvent(new CustomEvent('rewrite-so:main-world-ready'));
}

// 防止 unit test 在 node env 下 import 时 throw（没有 window）；
// 同时防止生产环境多次注册（content script 理论上只跑一次，但保险）。
if (typeof window !== 'undefined') {
  const FLAG = '__rewriteSoMainWorldMounted';
  const w = window as unknown as Record<string, unknown>;
  if (!w[FLAG]) {
    w[FLAG] = true;
    window.addEventListener('rewrite-so:draft-replace', handleReplaceRequest);
    announceReady();
  }
}
