/**
 * Main-world content script —— 跑在页面 JS context（不是 isolated world），
 * 能访问 React 挂在 DOM element 上的 `__reactFiber$xxx` expando 属性 + Lexical
 * 挂在 root DOM 上的 `__lexicalEditor` expando。
 *
 * 为什么需要这个独立 entry：
 *   Chrome MV3 content script 默认跑在 isolated world——共享 DOM 结构，但
 *   **看不到页面 JS 在 element 上设置的自定义属性**（包括 React fiber expando
 *   和 Lexical `__lexicalEditor`）。manifest 中用 `world: 'MAIN'` 声明此 entry。
 *
 * 三个 channel（按 plan v9 渐进式降级 + Lexical+all 短路）：
 *   1. `rewrite-so:paste-replace` —— 主路径，合成 ClipboardEvent + DataTransfer。0 反射。
 *   2. `rewrite-so:lexical-replace` —— Lexical fallback：fast (update+insertText) / slow (setEditorState)
 *   3. `rewrite-so:draft-replace` —— Draft fallback：fast (反射 5+ immutable class) / slow (fiber createFromText)
 *
 * 通信协议（CustomEvent on window）：
 *   - 入：`rewrite-so:<engine>-replace` { detail: { id, marker, payload } }
 *     marker 是临时 data-attribute 名，值是 id。main-world 通过 `[marker="id"]`
 *     查找目标元素（不能跨 world 传 DOM 引用）。
 *   - 出：`rewrite-so:<engine>-replace-result` { detail: { id, ok } }
 *
 * 失败契约：返 false 让上层 fallback；最深层失败时 isolated world 显示
 * 浮窗错误 UI（不静默关闭）。
 */

// ============================================================================
// Common types
// ============================================================================

interface DraftReplacePayload {
  newText: string;
  range: 'all' | 'selection';
}

interface LexicalReplacePayload {
  newText: string;
  fullText: string;
  range: 'all' | 'selection';
}

interface PasteReplacePayload {
  newText: string;
  range: 'all' | 'selection';
  selectionLength: number;
}

interface ReplaceRequestDetail<P> {
  id: string;
  marker: string;
  payload: P;
}

function findElByMarker(marker: string, id: string): Element | null {
  return document.querySelector(`[${marker}="${CSS.escape(id)}"]`);
}

function dispatchResult(channel: string, id: string, ok: boolean): void {
  window.dispatchEvent(new CustomEvent(channel, { detail: { id, ok } }));
}

// ============================================================================
// Draft.js fiber + 反射 fallback
// ============================================================================

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
  getBlockForKey(key: string): DraftContentBlockLike | undefined;
  getBlockMap(): DraftBlockMapLike;
  merge(props: Record<string, unknown>): DraftContentStateLike;
  constructor: {
    createFromText(text: string, delimiter?: string): DraftContentStateLike;
  };
}

interface DraftContentBlockLike {
  getKey(): string;
  getLength(): number;
  getText(): string;
  getCharacterList(): DraftCharListLike;
  merge(props: Record<string, unknown>): DraftContentBlockLike;
}

interface DraftSelectionStateLike {
  getStartKey(): string;
  getStartOffset(): number;
  getEndKey(): string;
  getEndOffset(): number;
  merge(props: Record<string, unknown>): DraftSelectionStateLike;
}

interface DraftCharListLike {
  first(): DraftCharMetaLike | undefined;
  slice(start: number, end?: number): DraftCharListLike;
  concat(other: DraftCharListLike): DraftCharListLike;
  constructor: {
    of(...items: DraftCharMetaLike[]): DraftCharListLike;
  };
}

interface DraftCharMetaLike {
  constructor: {
    EMPTY: DraftCharMetaLike;
  };
}

interface DraftBlockMapLike {
  set(key: string, value: DraftContentBlockLike): DraftBlockMapLike;
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
 * Draft fast fallback：反射 5+ immutable class 在 selection 处原位替换文字
 * 保留段落 + 选区外格式。仅支持单 block 选区（startKey === endKey）；跨段
 * 选区抛错落 slow fallback。
 *
 * 反射依赖（详见 plan v9）：`block.{getText, getCharacterList, merge}` +
 * `block.getCharacterList().first().constructor.EMPTY`（CharacterMetadata.EMPTY 静态）+
 * `characterList.constructor.of`（immutable.List.of 静态）+
 * `currentContent.{getBlockForKey, getBlockMap, merge}` +
 * `editorState.constructor.{push, forceSelection}` + selection.merge
 */
function replaceDraftSelectionViaReflection(props: DraftFiberHit['props'], newText: string): boolean {
  try {
    const editorState = props.editorState;
    const selection = editorState.getSelection();
    const startKey = selection.getStartKey();
    const endKey = selection.getEndKey();
    if (startKey !== endKey) return false; // 多 block 选区不支持
    const startOffset = selection.getStartOffset();
    const endOffset = selection.getEndOffset();
    const currentContent = editorState.getCurrentContent();
    const block = currentContent.getBlockForKey(startKey);
    if (!block) return false;
    const oldText = block.getText();
    const oldCharList = block.getCharacterList();
    const firstChar = oldCharList.first();
    if (!firstChar) {
      // 空 block：直接用 CharacterMetadata.EMPTY 不可达，退到 slow
      return false;
    }
    const CharMetaClass = firstChar.constructor;
    const ListClass = oldCharList.constructor;
    if (!CharMetaClass?.EMPTY || typeof ListClass?.of !== 'function') {
      return false; // 反射点 mangle，退到 slow
    }

    const newBlockText = oldText.slice(0, startOffset) + newText + oldText.slice(endOffset);
    const prefixChars = oldCharList.slice(0, startOffset);
    const suffixChars = oldCharList.slice(endOffset);
    const insertChars: DraftCharMetaLike[] = [];
    for (let i = 0; i < newText.length; i++) insertChars.push(CharMetaClass.EMPTY);
    const newCharList = prefixChars.concat(ListClass.of(...insertChars)).concat(suffixChars);

    const newBlock = block.merge({ text: newBlockText, characterList: newCharList }) as DraftContentBlockLike;
    const newBlockMap = currentContent.getBlockMap().set(startKey, newBlock);
    const newContent = currentContent.merge({ blockMap: newBlockMap }) as DraftContentStateLike;
    const EditorStateClass = editorState.constructor;
    const pushed = EditorStateClass.push(editorState, newContent, 'insert-characters');

    const newOffset = startOffset + newText.length;
    const endSel = pushed.getSelection().merge({
      anchorKey: startKey,
      anchorOffset: newOffset,
      focusKey: startKey,
      focusOffset: newOffset,
      isBackward: false,
      hasFocus: true,
    });
    const moved = EditorStateClass.forceSelection(pushed, endSel);
    props.onChange(moved);
    return true;
  } catch {
    return false;
  }
}

/**
 * 通过 React fiber 替换 Draft.js 编辑器内容。两层 fallback：
 *   - fast (range='selection')：反射 5+ class 原位替换 + 保选区外格式
 *   - slow (range='all' 或 fast 失败)：`ContentStateClass.createFromText(newText)` 整段重建
 *
 * 成功返回 true；失败返回 false（不动 DOM）。
 * @internal exported for unit tests
 */
export function replaceDraftEditor(el: Element, payload: DraftReplacePayload): boolean {
  try {
    const hit = findDraftEditorFiber(el);
    if (!hit) return false;
    const { props } = hit;

    // Fast fallback：仅 selection 路径
    if (payload.range === 'selection') {
      if (replaceDraftSelectionViaReflection(props, payload.newText)) return true;
      // fast 失败 → 继续 slow
    }

    // Slow fallback：整段重建
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
    const newContent = ContentStateClass.createFromText(payload.newText);
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

function handleDraftReplaceRequest(ev: Event): void {
  const detail = (ev as CustomEvent<ReplaceRequestDetail<DraftReplacePayload>>).detail;
  if (!detail || typeof detail.id !== 'string') return;
  const { id, marker, payload } = detail;
  let ok = false;
  try {
    const el = findElByMarker(marker, id);
    if (el && payload && typeof payload.newText === 'string') {
      ok = replaceDraftEditor(el, payload);
    }
  } catch {
    /* swallow */
  }
  dispatchResult('rewrite-so:draft-replace-result', id, ok);
}

// ============================================================================
// Lexical 反射 fallback
// ============================================================================

interface LexicalEditorLike {
  update(fn: () => void): void;
  getEditorState(): LexicalEditorStateLike;
  parseEditorState(json: string): LexicalEditorStateLike;
  setEditorState(state: LexicalEditorStateLike): void;
  /** Lexical 公开 API：把 selection 移到 root 末尾 + 设置 DOM focus。
   *  Lexical 0.11- 是 sync void；0.12+ 返 Promise<void>（async via rAF）。
   *  setEditorState 全替换 state 时新 state._selection 是 null → 调 focus() 让 caret 显示。 */
  focus?(): void | Promise<void>;
  _pendingEditorState?: { _selection?: LexicalSelectionLike | null } | null;
}

interface LexicalEditorStateLike {
  toJSON(): LexicalEditorStateJson;
}

interface LexicalSelectionLike {
  insertText(text: string): void;
}

interface LexicalEditorStateJson {
  root: {
    children: unknown[];
    direction: string | null;
    format: string;
    indent: number;
    type: string;
    version: number;
  };
}

type FastPathCapability = 'ok' | 'unavailable';
/**
 * Lexical fast path 能力 per-editor cache。WeakMap<editor, capability> 避免 SPA
 * 多 Lexical 实例（如 Reddit 帖子页同时有评论框 + 引用回复编辑器）相互污染：
 * editor A 的探测结果不会被 editor B 看到（不同 Lexical 版本可能 mangle 差异）。
 *
 * WeakMap 自动 GC：编辑器 DOM 销毁后 editor 引用失效，cache entry 也释放，
 * 不持有强引用避免内存泄漏。
 *
 * 'ok' / 'unavailable' 是终态（cache 后续调用）；未决定时（如 _pendingEditorState
 * 未实例化 / _selection 还是 null）返 'undetermined' **不 cache** 让下次重试。
 */
const lexicalFastPathCapability = new WeakMap<LexicalEditorLike, FastPathCapability>();

function probeLexicalFastPath(editor: LexicalEditorLike): 'ok' | 'unavailable' | 'undetermined' {
  const cached = lexicalFastPathCapability.get(editor);
  if (cached) return cached;
  const pending = editor._pendingEditorState;
  if (!pending) return 'undetermined';
  const sel = pending._selection;
  if (!sel) return 'undetermined';
  try {
    const ok = typeof sel.insertText === 'function';
    lexicalFastPathCapability.set(editor, ok ? 'ok' : 'unavailable');
    return ok ? 'ok' : 'unavailable';
  } catch {
    lexicalFastPathCapability.set(editor, 'unavailable');
    return 'unavailable';
  }
}

function getLexicalEditor(el: Element): LexicalEditorLike | null {
  // 沿 parentNode + host 链路找 root（跨 shadow boundary）
  let cur: Node | null = el;
  while (cur) {
    if (cur instanceof Element && cur.getAttribute?.('data-lexical-editor') === 'true') {
      const editor = (cur as unknown as { __lexicalEditor?: LexicalEditorLike }).__lexicalEditor;
      if (editor && typeof editor.update === 'function') return editor;
      return null;
    }
    const host: Element | null = (cur as unknown as { host?: Element | null }).host ?? null;
    const parent: Node | null = cur.parentNode ?? host;
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/**
 * Lexical 反射 fallback：两层 fast/slow。
 *   - fast (range='selection')：editor.update + RangeSelection.insertText（保格式）
 *   - slow (range='all' / fast 失败)：setEditorState(parseEditorState(单段纯文本 JSON))
 * @internal exported for unit tests
 */
export function replaceLexicalEditor(el: Element, payload: LexicalReplacePayload): boolean {
  try {
    const editor = getLexicalEditor(el);
    if (!editor) return false;
    if (
      typeof editor.getEditorState !== 'function' ||
      typeof editor.parseEditorState !== 'function' ||
      typeof editor.setEditorState !== 'function'
    ) {
      return false;
    }

    // Fast path：仅 selection
    if (payload.range === 'selection') {
      const cap = probeLexicalFastPath(editor);
      if (cap === 'ok' || cap === 'undetermined') {
        let inserted = false;
        try {
          editor.update(() => {
            const sel = editor._pendingEditorState?._selection;
            if (sel && typeof sel.insertText === 'function') {
              sel.insertText(payload.newText);
              inserted = true;
            }
          });
        } catch {
          /* fall to slow */
        }
        if (inserted) return true;
      }
    }

    // Slow path：setEditorState 全替换
    const text = payload.range === 'all' ? payload.newText : payload.fullText;
    const template = editor.getEditorState().toJSON();
    const newJson: LexicalEditorStateJson = {
      ...template,
      root: {
        ...template.root,
        children: [
          {
            type: 'paragraph',
            version: 1,
            children:
              text === ''
                ? []
                : [
                    {
                      type: 'text',
                      version: 1,
                      text,
                      format: 0,
                      mode: 'normal',
                      style: '',
                      detail: 0,
                    },
                  ],
            direction: template.root.direction ?? null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
          },
        ],
      },
    };
    const newState = editor.parseEditorState(JSON.stringify(newJson));
    editor.setEditorState(newState);
    // 新 EditorState 的 _selection 是 null（JSON 不含 selection 字段）→ DOM 上 caret
    // 不显示。调 editor.focus() 让 Lexical 把 selection 移到 root 末尾 + 设置 DOM focus。
    // Lexical 0.12+ editor.focus(options) 返 Promise<void>（之前版本是 sync）。包
    // Promise.resolve 兼容同步抛出 + 异步 reject 两种 case，不让 unhandled promise
    // rejection 上升到 page 控制台。
    try {
      const result = editor.focus?.();
      if (result && typeof (result as unknown as Promise<void>).catch === 'function') {
        (result as unknown as Promise<void>).catch(() => {
          /* async focus reject → caret 显示降级，内容已写入 */
        });
      }
    } catch {
      /* sync focus throw → 同上 */
    }
    return true;
  } catch {
    return false;
  }
}

function handleLexicalReplaceRequest(ev: Event): void {
  const detail = (ev as CustomEvent<ReplaceRequestDetail<LexicalReplacePayload>>).detail;
  if (!detail || typeof detail.id !== 'string') return;
  const { id, marker, payload } = detail;
  let ok = false;
  try {
    const el = findElByMarker(marker, id);
    if (el && payload && typeof payload.newText === 'string') {
      ok = replaceLexicalEditor(el, payload);
    }
  } catch {
    /* swallow */
  }
  dispatchResult('rewrite-so:lexical-replace-result', id, ok);
}

// ============================================================================
// 合成 paste 主路径
// ============================================================================

/**
 * 合成 paste 主路径：构造 ClipboardEvent + DataTransfer + setData('text/plain')，
 * dispatch 到目标 contenteditable 让 framework 自家 onPaste handler 处理。
 *
 * 探针：
 *   - 强信号 dispatchedDefault === false → framework 主动 preventDefault 接管 → 立即返 true
 *   - 弱信号 rAF×3 后 textContent 必须变化（after !== before）+ 必须含 newText 短前缀
 *
 * 剪贴板零污染（W3C 规范保证）：合成 ClipboardEvent + 自建 DataTransfer 是 DOM
 * 内部事件，不读写系统剪贴板。
 * @internal exported for unit tests
 */
export async function replacePasteEditor(el: Element, payload: PasteReplacePayload): Promise<boolean> {
  try {
    const before = (el as HTMLElement).textContent ?? '';

    // range='all' 时主动 selectNodeContents 让 framework 看到全选 selection。
    // 注意：isTrusted=false 的合成 DOM selection 在 Lexical 上会被 onSelectionChange
    // 重置 —— write.ts 已在 Lexical+all 路径短路跳过本主路径，所以本 case 仅对
    // Draft / ProseMirror / Slate 等较宽容 framework 生效。
    if (payload.range === 'all') {
      try {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      } catch {
        /* shadow DOM / 不可选区 ce → 探针失败兜底 */
      }
    }

    const dt = new DataTransfer();
    dt.setData('text/plain', payload.newText);
    const evt = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    const dispatchedDefault = el.dispatchEvent(evt);
    if (dispatchedDefault === false) return true; // 强信号

    // 弱信号：rAF×5 后三条件（P0-2 plan v9 后强化）。
    // 5 帧 (~80ms) 比原 3 帧给 framework 更充裕的 reconcile 窗口。再加一个 microtask
    // tick (Promise.resolve()) 兜底 framework 异步 transaction 在 rAF 之后再 commit。
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await Promise.resolve();
    const after = (el as HTMLElement).textContent ?? '';
    if (after === before) return false; // 完全没变 → 必失败
    const probeLen = Math.min(16, payload.newText.length);
    if (probeLen === 0) return after !== before; // newText 是空串，仅看变化即可
    if (!after.includes(payload.newText.slice(0, probeLen))) return false;
    // P1-4 长度差校验：防 false positive（原文本来就含 newText 前缀；framework 部分
    // 写入导致 textContent 变化但 newText 未完整写入）。期望长度差：
    //   - range='selection': after.length - before.length ≈ newText.length - selectionLength
    //   - range='all': after.length - before.length ≈ newText.length - before.length (= newText.length - selectionLength)
    // 容差 ±3 字符给 trailing newline / paragraph break / framework 添加的 zero-width chars。
    const lenDelta = after.length - before.length;
    const expectedDelta = payload.newText.length - payload.selectionLength;
    if (Math.abs(lenDelta - expectedDelta) > 3) return false;
    return true;
  } catch {
    return false;
  }
}

function handlePasteReplaceRequest(ev: Event): void {
  const detail = (ev as CustomEvent<ReplaceRequestDetail<PasteReplacePayload>>).detail;
  if (!detail || typeof detail.id !== 'string') return;
  const { id, marker, payload } = detail;
  (async () => {
    let ok = false;
    try {
      const el = findElByMarker(marker, id);
      if (el && payload && typeof payload.newText === 'string') {
        ok = await replacePasteEditor(el, payload);
      }
    } catch {
      /* swallow */
    }
    dispatchResult('rewrite-so:paste-replace-result', id, ok);
  })();
}

// ============================================================================
// Bootstrap
// ============================================================================

/**
 * 向 isolated world 广播 main-world 已 ready。
 *
 * - 通过 documentElement 上的 `data-rewrite-so-main-world-ready` attribute（DOM
 *   跨 world 共享）让 isolated 侧能**同步**检查 ready 状态——避免每次都等异步事件。
 * - 同时 dispatch 一次性 CustomEvent，给"adapter 模块在 main-world.ts 之前注册了
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
    window.addEventListener('rewrite-so:paste-replace', handlePasteReplaceRequest);
    window.addEventListener('rewrite-so:lexical-replace', handleLexicalReplaceRequest);
    window.addEventListener('rewrite-so:draft-replace', handleDraftReplaceRequest);
    announceReady();
  }
}
