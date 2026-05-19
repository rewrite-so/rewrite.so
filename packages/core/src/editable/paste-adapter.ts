/**
 * 合成 paste 主路径 client —— 跨 framework 统一 0 反射写入。
 *
 * 为什么用合成 paste：
 *   受控编辑器（Lexical / Draft / ProseMirror / Slate）的 paste handler 全部
 *   不查 event.isTrusted，从 `event.clipboardData.getData('text/plain')` 取数据
 *   走自家 model 写入路径 —— 保留段落 / 选区外格式 / undo / 不污染系统剪贴板。
 *   实测确认 Reddit Lexical + X Draft 都支持。
 *
 * 为什么走 main world：
 *   合成 ClipboardEvent + DataTransfer 必须在页面 realm 构造，避免 framework
 *   做 instance / className 检查时跨 realm 失败。Lexical `objectKlassEquals` 用
 *   `constructor.name` 比较是跨 realm 安全的；但 Draft 的 React event system 在
 *   isolated world dispatch 时可能不被识别 —— 实测 Draft 必须 dispatch 到
 *   `.public-DraftEditor-content` 内层 contenteditable 上才生效。
 *
 * 探针策略（详见 main-world.ts `replacePasteEditor`）：
 *   - 强信号：dispatchEvent return false（framework 主动 preventDefault 接管）→ 立即返 true
 *   - 弱信号：rAF×3 后 textContent 必须变化 + 必须含 newText 短前缀 → 返 true
 *   - 都失败 → 返 false，让上层 fallback（Lexical 反射 / Draft 反射 / 通用 DOM 路径）
 *
 * 剪贴板零污染（W3C clipboard-apis 规范）：
 *   合成 ClipboardEvent + 自建 DataTransfer 是 DOM 内部事件，不读写系统剪贴板。
 *   用户 Ctrl+C 复制的内容完全不变。
 *
 * 协议见 main-world.ts 头注释。失败时不写 DOM —— 受控编辑器外部改 DOM 会被
 * reconcile 留下崩溃态。失败 = 浮层不关闭，上层 fallback 接管。
 */

import { waitForMainWorldReady } from './main-world-ready.ts';

const REPLACE_EVENT = 'rewrite-so:paste-replace';
const RESULT_EVENT = 'rewrite-so:paste-replace-result';
/** 独立 marker attr 避免与 lexical / draft adapter race 互相覆盖 */
const MARKER_ATTR = 'data-rewrite-so-paste-target';

/**
 * 等 main-world 回响应的超时（ms）。
 * 包含 dispatchPasteAndProbe 的 rAF×3 (~48ms) + dispatch hop，所以比 draft.ts 略宽。
 */
const REPLACE_TIMEOUT_MS = 2500;

let requestSeq = 0;

export interface PasteReplacePayload {
  newText: string;
  range: 'all' | 'selection';
  /**
   * 调用方 capture 的选区长度（range='selection' 时是选中字符数；range='all' 时
   * 是当前 textContent 长度）。给 main-world 探针做长度差合理性检查，避免误判。
   */
  selectionLength: number;
}

/**
 * 请求 main-world 用合成 paste 替换编辑器内容。
 *
 * Promise resolves to true 表示 framework paste handler 已写入；
 * false 表示 framework 不响应合成 paste / 探针失败 / main-world 没装 / 超时。
 */
export async function requestPasteReplace(
  el: Element,
  payload: PasteReplacePayload,
): Promise<boolean> {
  await waitForMainWorldReady();
  return new Promise<boolean>((resolve) => {
    const id = `rs-paste-${Date.now()}-${++requestSeq}`;

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
