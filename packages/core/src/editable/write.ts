import { detectControlledEditor, getEditableKind } from './detect.ts';
import { requestDraftReplace } from './draft.ts';
import { requestLexicalReplace } from './lexical.ts';
import { requestPasteReplace } from './paste-adapter.ts';

export type WriteRange = 'selection' | 'all';

/**
 * 安全替换输入框内容（保持框架受控状态 + undo 栈尽可能保留）。
 *
 * 分级策略：
 * 1. <input>/<textarea>: 全部 → prototype setter（必须，React 受控才感知）；选区 → setRangeText。
 *    dispatch input/change 都带 composed: true，跨 shadow DOM boundary 通知外层
 *    React state / Web Component 同步（如 Reddit `<faceplate-textarea-input>`）。
 * 2. contenteditable: 渐进式降级（plan v9）：
 *    a. **Lexical + range='all' 短路**：实测合成 selectNodeContents 被 Lexical
 *       onSelectionChange 拒（isTrusted=false），直接走 Lexical 反射 setEditorState
 *       slow path 避免 ~50ms 无效 paste 探针延迟。
 *    b. **非受控 contenteditable 短路**：没有 framework paste handler，dispatch
 *       合成 paste 浏览器 default action 不执行（W3C 规范），直接走通用 DOM 路径。
 *    c. **主路径合成 paste**：受控编辑器（Lexical selection / Draft / PM / Slate）
 *       走 main-world 合成 ClipboardEvent + DataTransfer，让 framework 自家 onPaste
 *       handler 处理（0 反射、保段落、保选区外格式、剪贴板零污染）。
 *    d. **Lexical fallback**：paste 探针失败 → editor.update + RangeSelection.insertText
 *       fast path / setEditorState slow path（双层）。
 *    e. **Draft fallback**：paste 探针失败 → 反射 5+ immutable class 重建 block fast path
 *       / fiber createFromText slow path（双层；详见 main-world.ts）。
 *    f. **终极兜底**：未识别的受控编辑器走通用 DOM 路径。
 *
 * 失败时返 false → 调用方（mount.ts onSelect）显示 setWriteFailed UI（不静默关闭）。
 */
export async function replaceEditable(
  el: HTMLElement,
  newText: string,
  range: WriteRange,
): Promise<boolean> {
  const kind = getEditableKind(el);

  if (kind === 'input' || kind === 'textarea') {
    replaceFormField(el as HTMLInputElement | HTMLTextAreaElement, newText, range);
    return true;
  }
  if (kind === 'contenteditable') {
    return await replaceContentEditable(el, newText, range);
  }
  return false;
}

function replaceFormField(
  el: HTMLInputElement | HTMLTextAreaElement,
  newText: string,
  range: WriteRange,
): void {
  if (range === 'all') {
    setNativeValue(el, newText);
    dispatchInputChange(el);
    return;
  }
  // selection
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (end > start) {
    el.setRangeText(newText, start, end, 'end');
    dispatchInputChange(el);
    return;
  }
  // 没有选区也按全替换
  setNativeValue(el, newText);
  dispatchInputChange(el);
}

/**
 * input + change 事件 dispatch。`composed: true` 让事件跨 shadow DOM boundary
 * —— shadow DOM 内的 textarea（如 Reddit `<faceplate-textarea-input>` 内部）
 * 写值后，外层 light DOM 的 React state 监听 / Web Component 状态同步靠
 * `composed: true` 才能收到事件。
 */
function dispatchInputChange(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

/**
 * React 受控 input 关键 hack：必须用 prototype setter 触发 `set` trap，
 * 否则 React 监听的 onChange 不会感知值变化（ReactDOM 拦截 .value 赋值）。
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  const setter = desc?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
}

/**
 * 渐进式降级调度 contenteditable 写入。返 true = 任意一层命中；false = 全部失败。
 * 详见函数头注释。
 */
async function replaceContentEditable(
  el: HTMLElement,
  newText: string,
  range: WriteRange,
): Promise<boolean> {
  // focus 保证操作目标正确（onSelect 已 focus 但保险幂等）
  if (document.activeElement !== el) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* legacy */
    }
  }

  // 检测引擎 + 短路决策。**所有受控编辑器 + range='all' 一律跳过 paste 主路径**：
  // 实测合成 `selectNodeContents` 是 isTrusted=false，会被 framework selectionchange
  // handler 重置（Lexical onSelectionChange / Draft onSelect / ProseMirror plugin chain /
  // Slate insert filter 都有 trusted 校验）→ paste handler 内 model selection 仍是
  // collapsed at caret → paste 走 insert at caret 而非 replace → "原文 + newText" append。
  // 直接走 framework-specific fallback 或通用 DOM 路径整段重建。
  const engine = detectControlledEditor(el);

  // 短路 1：Lexical + range='all' → setEditorState 反射 slow path（实测 100% work）
  if (engine === 'lexical' && range === 'all') {
    const ok = await requestLexicalReplace(el, { newText, fullText: newText, range });
    if (ok) return true;
    return false; // 反射失败 → 静默不走通用 DOM（避免 Lexical 上写 3 次 bug）
  }

  // 短路 2：Draft + range='all' → fiber createFromText 整段重建
  if (engine === 'draft' && range === 'all') {
    const ok = await requestDraftReplace(el, { newText, range });
    if (ok) return true;
    return false;
  }

  // 短路 3：ProseMirror / Slate + range='all' → 通用 DOM 路径整段重建（无专用反射
  // fallback）。通用 DOM 路径在 PM / Slate 上：execCommand insertText 在 selectAll 范围
  // 整段替换 —— 比 paste handler 在 collapsed selection 处 insert 的 append 行为更接近
  // 用户期望。**已知风险**：PM / Slate 是受控树，通用 DOM 路径可能触发类似 Lexical 的
  // model reconcile 异常（虽不至于"写 3 次"，可能残留 / 格式异常）。上线后通过 telemetry
  // 监控决定是否升级反射 fallback。CLAUDE.md 已知限制段已记录。
  if ((engine === 'prosemirror' || engine === 'slate') && range === 'all') {
    warnPmSlateDomFallback(engine);
    replaceContentEditableViaDom(el, newText, range);
    return true;
  }

  // 短路 4：非受控编辑器走通用 DOM 路径（合成 paste 在无 paste handler 的 ce 上必失败）
  if (!engine) {
    replaceContentEditableViaDom(el, newText, range);
    return true;
  }

  // 主路径：合成 paste（受控编辑器 + range='selection'）
  // 计算 selectionLength 给 main-world 探针做长度差检查（防 false positive）
  const selectionLength = computeSelectionLength(el, range);
  const pasteOk = await requestPasteReplace(el, { newText, range, selectionLength });
  if (pasteOk) return true;

  // Fallback 1：Lexical 反射（range='selection' fast / slow path）
  if (engine === 'lexical') {
    const fullText = range === 'selection' ? buildLexicalSelectionFullText(el, newText) : newText;
    return await requestLexicalReplace(el, { newText, fullText, range });
  }

  // Fallback 2：Draft 反射（fast: 5+ class 重建 block / slow: fiber createFromText）
  if (engine === 'draft') {
    return await requestDraftReplace(el, { newText, range });
  }

  // 终极兜底：ProseMirror / Slate / 其它未识别受控编辑器 → 通用 DOM 路径
  replaceContentEditableViaDom(el, newText, range);
  return true;
}

/**
 * 计算当前选区字符长度（给 main-world paste 探针）。range='all' 时返回当前
 * textContent 长度；range='selection' 时返回选中字符数；DOM Range 不可用时返 0。
 */
function computeSelectionLength(el: HTMLElement, range: WriteRange): number {
  if (range === 'all') return (el.textContent ?? '').length;
  try {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return 0;
    return s.toString().length;
  } catch {
    return 0;
  }
}

/**
 * Lexical slow path 用：在 isolated world 用 DOM Range 长度法拼好
 * `prefix + newText + suffix` 完整新文本，给 main-world setEditorState 全替换。
 *
 * 实现细节：DOM Range 的 offset 是相对 textNode 的；用 `selectNodeContents(el) → setEnd(rangeStart)`
 * 拿到 prefix 长度（Range.toString 折叠为纯文本，长度可靠）。富文本 inline element
 * 边界可能 ±1 字符偏差（已知限制）。
 */
function buildLexicalSelectionFullText(el: HTMLElement, newText: string): string {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return newText;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return newText;

    const fullText = el.textContent ?? '';

    const prefixRange = document.createRange();
    prefixRange.setStart(el, 0);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const prefixLen = prefixRange.toString().length;

    const selLen = range.toString().length;

    return fullText.slice(0, prefixLen) + newText + fullText.slice(prefixLen + selLen);
  } catch {
    return newText;
  }
}

/**
 * 通用 DOM 路径 —— Lexical / Draft 之外的 contenteditable（Slate /
 * ProseMirror / 普通 contenteditable）。总是走完 `beforeinput → 重置 selection →
 * execCommand → input` 完整链路。**不**根据 framework preventDefault 返回值
 * silent return —— 浏览器对合成 InputEvent 不会执行默认行为，"框架接管"假设
 * 不成立，我们必须始终自己写。execCommand 失败时 DOM Range 兜底用
 * selectNodeContents(el) 重建全范围，避免 sel.getRangeAt(0) 被框架 handler 漂移
 * 到 collapsed selection 后留下旧内容残留。
 *
 * Lexical / Draft.js 走专用 main-world adapter，不走本路径（详见 plan v9 / 头注释）。
 */
function replaceContentEditableViaDom(el: HTMLElement, newText: string, range: WriteRange): void {
  const selectAll = () => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  };

  // 1. 建立目标 selection
  if (range === 'all') {
    selectAll();
  } else {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed) selectAll();
  }

  // 2. 通知框架
  try {
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertReplacementText',
        data: newText,
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
  } catch {
    /* 老浏览器不支持 InputEvent constructor */
  }

  // 3. beforeinput handler 可能把 selection 折叠 / 移走（即使没 preventDefault），
  //    全替换模式重置一次再写。
  if (range === 'all') selectAll();

  // 4. 写入：execCommand 优先（保留 undo 栈 + 触发原生 input 事件链）
  let written = false;
  if (typeof document.execCommand === 'function') {
    try {
      written = document.execCommand('insertText', false, newText);
    } catch {
      /* ignore */
    }
  }

  // 5. 兜底：DOM Range 重做
  if (!written) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.deleteContents();
    const node = document.createTextNode(newText);
    r.insertNode(node);
    const s = window.getSelection();
    const after = document.createRange();
    after.setStartAfter(node);
    after.collapse(true);
    s?.removeAllRanges();
    s?.addRange(after);
  }

  // 6. 无条件 dispatch input
  el.dispatchEvent(
    new InputEvent('input', {
      inputType: 'insertReplacementText',
      data: newText,
      bubbles: true,
      composed: true,
    }),
  );
}

/**
 * Plan v9 P2-5: ProseMirror / Slate range='all' 走通用 DOM 路径是已知技术债
 * （注释见 replaceContentEditable 短路 3）。在生产环境 console.warn 一次让开发
 * 工具 / Sentry 等监控能 grep 这条路径的真实使用，决定是否升级专用反射 fallback。
 *
 * 用 module-level Set 防 spam：同一 engine 同一页生命周期仅 warn 一次。SPA 路由
 * 切换 / 重新 mount extension 时 module 重新加载，Set 自然重置。
 */
const warnedPmSlateEngines = new Set<string>();
function warnPmSlateDomFallback(engine: 'prosemirror' | 'slate'): void {
  if (warnedPmSlateEngines.has(engine)) return;
  warnedPmSlateEngines.add(engine);
  try {
    // eslint-disable-next-line no-console
    console.warn(
      `[rewrite.so] ${engine} + range='all' fell back to generic DOM path. ` +
        `This is an acknowledged technical debt — see CLAUDE.md "已知不支持场景" + plan v9 P2-5.`,
    );
  } catch {
    /* console missing in some sandboxed environments — ignore */
  }
}

// 测试 / 调试用导出
export { buildLexicalSelectionFullText, replaceContentEditableViaDom };
