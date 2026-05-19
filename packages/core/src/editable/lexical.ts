/**
 * Lexical 反射适配器 client —— 仅用作 paste 主路径失败时的 fallback。
 *
 * 为什么需要 Lexical 专用 fallback：
 *   合成 paste 主路径在真实用户选区场景下命中率高，但有两种失败 case：
 *   1. range='all' 时 caller `selectNodeContents(el)` 是 isTrusted=false，Lexical
 *      onSelectionChange 在编辑器无真实 focus 时会重置 → paste handler 内
 *      `$getSelection()` 拿到 collapsed selection → paste 走 insert at caret 而
 *      非整段替换。**实测确认**：write.ts 在 Lexical+range='all' 时直接短路本路径。
 *   2. paste 探针 false negative（异步 transaction 延迟 / 弱信号未命中）→
 *      此时 framework model 也未更新，需要 fallback 反射写入。
 *
 * 两层 fast/slow：
 *   - fast (selection only)：`editor.update(() => editor._pendingEditorState._selection.insertText(newText))`
 *     —— 保留段落 + 选区外格式（粗体 / 链接 / 列表）。依赖私有字段 `_pendingEditorState`
 *     和 RangeSelection.insertText 公开 prototype 方法。
 *   - slow (all / fast 失败)：`setEditorState(parseEditorState(JSON))` 全替换
 *     —— 保留前后文（caller 在 isolated world 拼好的 fullText），inline 格式丢失。
 *
 * 协议见 main-world.ts 头注释。失败时不写 DOM —— Lexical 受控树外部改 DOM 会
 * 被立即 reconcile 留下崩溃态。
 */

import { waitForMainWorldReady } from './main-world-ready.ts';

const REPLACE_EVENT = 'rewrite-so:lexical-replace';
const RESULT_EVENT = 'rewrite-so:lexical-replace-result';
/** 独立 marker attr 避免与 paste / draft adapter race 互相覆盖 */
const MARKER_ATTR = 'data-rewrite-so-lex-target';

const REPLACE_TIMEOUT_MS = 2500;

let requestSeq = 0;

export interface LexicalReplacePayload {
  /** fast path 用 selection.insertText 写入这个 */
  newText: string;
  /**
   * slow path 用此 setEditorState 全替换。
   * range='selection' 时 caller 在 isolated world 用 DOM Range 长度法拼好
   * `prefix + newText + suffix`；range='all' 时等同 newText。
   */
  fullText: string;
  range: 'all' | 'selection';
}

/**
 * 请求 main-world 用 Lexical 反射 fallback 替换编辑器内容。
 *
 * Promise resolves to true 表示已成功调到 editor.update / setEditorState；
 * false 表示 expando 找不到 / 反射 throw / 超时 / main-world 没装。
 */
export async function requestLexicalReplace(
  el: Element,
  payload: LexicalReplacePayload,
): Promise<boolean> {
  await waitForMainWorldReady();
  return new Promise<boolean>((resolve) => {
    const id = `rs-lex-${Date.now()}-${++requestSeq}`;

    let settled = false;
    const cleanup = () => {
      window.removeEventListener(RESULT_EVENT, onResult as EventListener);
      if (el.getAttribute(MARKER_ATTR) === id) {
        el.removeAttribute(MARKER_ATTR);
      }
    };
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };

    const onResult = (ev: Event) => {
      const detail = (ev as CustomEvent<{ id: string; ok: boolean }>).detail;
      if (!detail || detail.id !== id) return;
      settle(!!detail.ok);
    };

    window.addEventListener(RESULT_EVENT, onResult as EventListener);

    try {
      el.setAttribute(MARKER_ATTR, id);
      window.dispatchEvent(
        new CustomEvent(REPLACE_EVENT, {
          detail: { id, marker: MARKER_ATTR, payload },
        }),
      );
    } catch {
      settle(false);
      return;
    }

    window.setTimeout(() => settle(false), REPLACE_TIMEOUT_MS);
  });
}
