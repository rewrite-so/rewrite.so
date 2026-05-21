/**
 * Draft.js 适配器 client —— 通过 CustomEvent 把替换请求转给 main-world 脚本。
 *
 * 为什么必须走 main world：
 *   X (Twitter)、老 Medium 等用 Draft.js 的站点，外部代码必须调
 *   props.onChange(newEditorState) 才能正确驱动 Draft 的 EditorState 更新。
 *   React 把 fiber / props 挂在 DOM element 上的 `__reactFiber$xxx` /
 *   `__reactProps$xxx` expando 属性上 —— 但 Chrome MV3 的 content script
 *   跑在 isolated world，**看不到页面 JS 设置的 expando 属性**（共享 DOM 结构，
 *   不共享 JS 对象属性）。
 *
 *   解决方案：把 fiber walk + 反射调用 onChange 的逻辑放到 main world content
 *   script（manifest 中声明 `world: 'MAIN'`），通过 CustomEvent 通信。
 *
 *   实际的 fiber + 反射代码在 `apps/extension/src/content/main-world.ts`，
 *   本文件只是 isolated world 侧的 dispatch client。
 *
 * 协议见 main-world.ts 头注释。失败时不写 DOM —— Draft 受控树外部改 DOM 会
 * 被立即 reconcile，留下"DOM 改了 model 没改"的崩溃态。失败 = 浮层关闭但
 * 内容不变（更安全）。
 *
 * web /try 路径：web 端没注入 main world script（mount 是页面 JS 直接调，
 * 本来就在 main world，但 web /try 也不会遇到 Draft.js 编辑器）。dispatch
 * 出去无 listener 监听 → 静默无副作用。
 */

import { waitForMainWorldReady } from './main-world-ready.ts';

const REPLACE_EVENT = 'rewrite-so:draft-replace';
const RESULT_EVENT = 'rewrite-so:draft-replace-result';
/** 独立 marker attr 避免与 paste / lexical adapter race 互相覆盖 */
const MARKER_ATTR = 'data-rewrite-so-draft-target';
/**
 * 等 main-world 回响应的超时（ms）。
 * main-world handler 是 sync 跑完（实测 < 50ms），但低端机 / 广告 SDK 占用 CPU /
 * Chrome 不保证 inject.ts 与 main-world.ts 注入顺序（理论上 main-world 可能晚到）
 * 时需要余量。2500ms 与 MV3 service worker 30s 强 kill 留充足距离。
 */
const REPLACE_TIMEOUT_MS = 2500;

/**
 * 是否是 Draft.js 编辑器（DOM 特征匹配，isolated world 也能看 DOM）。
 */
export function isDraftEditor(el: Element | null | undefined): boolean {
  if (!el || !(el instanceof Element)) return false;
  if (el.classList.contains('public-DraftEditor-content')) return true;
  return !!el.closest('.DraftEditor-root');
}

let requestSeq = 0;

export interface DraftReplacePayload {
  newText: string;
  /**
   * 'all' → 现有 fiber 路径整段 `ContentStateClass.createFromText(newText)`；
   * 'selection' → 反射 5+ immutable class 重建 block 保段落 + 选区外格式 fast fallback，
   *   失败落 fiber slow fallback。
   *
   * 注：Plan v9 把合成 paste 作为 Draft 选区改写的主路径，本反射 fallback 仅在
   * paste 探针 false negative 时启用。fast fallback 由 main-world 在 Phase 0
   * verify 后条件启用（X 仍用 Draft.js 时启用）。
   */
  range: 'all' | 'selection';
}

/** Draft 反射 fallback 的结果：是否成功 + 命中的子路径（fast/slow）。 */
export interface DraftReplaceResult {
  ok: boolean;
  /** 'fast' = 反射原位重建 block（保格式）；'slow' = fiber createFromText。ok=false 时无意义。 */
  path?: 'fast' | 'slow';
}

/**
 * 请求 main-world 脚本替换 Draft.js 编辑器内容。
 *
 * 流程：
 * 1. 给目标元素打临时 data-attribute marker（唯一 id），用于跨 world 定位
 * 2. dispatch CustomEvent('rewrite-so:draft-replace')
 * 3. 等 'rewrite-so:draft-replace-result' 回响应（或超时）
 * 4. 清理 marker
 *
 * resolve `{ ok: true, path }` 表示已成功调到 props.onChange，
 * `{ ok: false }` 表示 fiber 找不到 / 反射失败 / 超时 / main-world 脚本没装。
 */
export async function requestDraftReplace(
  el: Element,
  payload: DraftReplacePayload,
): Promise<DraftReplaceResult> {
  // 等 main-world 信号到位再 dispatch；超时仍 proceed 让 REPLACE_TIMEOUT_MS 兜底
  await waitForMainWorldReady();
  return new Promise<DraftReplaceResult>((resolve) => {
    const id = `rs-draft-${Date.now()}-${++requestSeq}`;

    let settled = false;
    const cleanup = () => {
      window.removeEventListener(RESULT_EVENT, onResult as EventListener);
      // 主动清 marker 避免污染 DOM（main-world 处理后理论上不需要标记了）
      if (el.getAttribute(MARKER_ATTR) === id) {
        el.removeAttribute(MARKER_ATTR);
      }
    };
    const settle = (result: DraftReplaceResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onResult = (ev: Event) => {
      const detail = (ev as CustomEvent<{ id: string; ok: boolean; path?: 'fast' | 'slow' }>)
        .detail;
      if (!detail || detail.id !== id) return;
      settle({ ok: !!detail.ok, path: detail.path });
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
      settle({ ok: false });
      return;
    }

    // 超时兜底 —— main-world script 没装 / 处理 throw 未发回响应时不能挂死
    window.setTimeout(() => settle({ ok: false }), REPLACE_TIMEOUT_MS);
  });
}
