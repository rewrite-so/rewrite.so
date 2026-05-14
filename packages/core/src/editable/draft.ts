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

const REPLACE_EVENT = 'rewrite-so:draft-replace';
const RESULT_EVENT = 'rewrite-so:draft-replace-result';
const READY_EVENT = 'rewrite-so:main-world-ready';
const READY_ATTR = 'data-rewrite-so-main-world-ready';
const MARKER_ATTR = 'data-rewrite-so-target';
/**
 * 等 main-world 回响应的超时（ms）。
 * main-world handler 是 sync 跑完（实测 < 50ms），但低端机 / 广告 SDK 占用 CPU /
 * Chrome 不保证 inject.ts 与 main-world.ts 注入顺序（理论上 main-world 可能晚到）
 * 时需要余量。2500ms 与 MV3 service worker 30s 强 kill 留充足距离。
 */
const REPLACE_TIMEOUT_MS = 2500;
/**
 * 等 main-world 准备好的最长等待（ms）。Chrome 不保证同 manifest 内多 content_script
 * entry 的注入顺序，inject.ts 可能先于 main-world.ts 运行。500ms 远大于实测
 * 的注入间隔（< 10ms），同时短到对用户不可感知；超时仍尝试 dispatch（让
 * REPLACE_TIMEOUT_MS 做最终兜底）。
 */
const READY_WAIT_MS = 500;

/**
 * 同步检查 main-world script 是否已 ready —— 它在 mount 时给 documentElement 设
 * `data-rewrite-so-main-world-ready=1`（attribute 跨 world 共享）。
 */
function isMainWorldReady(): boolean {
  return !!document.documentElement?.hasAttribute(READY_ATTR);
}

/**
 * 等到 main-world ready，或超时（无论如何返回，让上层超时机制兜底）。
 * 已 ready 时立即 resolve，不引入额外延迟。
 */
function waitForMainWorldReady(): Promise<void> {
  if (isMainWorldReady()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener(READY_EVENT, onReady);
      resolve();
    };
    const onReady = () => finish();
    window.addEventListener(READY_EVENT, onReady, { once: true });
    window.setTimeout(finish, READY_WAIT_MS);
  });
}

/**
 * 是否是 Draft.js 编辑器（DOM 特征匹配，isolated world 也能看 DOM）。
 */
export function isDraftEditor(el: Element | null | undefined): boolean {
  if (!el || !(el instanceof Element)) return false;
  if (el.classList.contains('public-DraftEditor-content')) return true;
  return !!el.closest('.DraftEditor-root');
}

let requestSeq = 0;

/**
 * 请求 main-world 脚本替换 Draft.js 编辑器内容。
 *
 * 流程：
 * 1. 给目标元素打临时 data-attribute marker（唯一 id），用于跨 world 定位
 * 2. dispatch CustomEvent('rewrite-so:draft-replace')
 * 3. 等 'rewrite-so:draft-replace-result' 回响应（或超时）
 * 4. 清理 marker
 *
 * Promise resolves to true 表示已成功调到 props.onChange，
 * false 表示 fiber 找不到 / 反射失败 / 超时 / main-world 脚本没装。
 */
export async function requestDraftReplace(el: Element, newText: string): Promise<boolean> {
  // 等 main-world 信号到位再 dispatch；超时仍 proceed 让 REPLACE_TIMEOUT_MS 兜底
  await waitForMainWorldReady();
  return new Promise<boolean>((resolve) => {
    const id = `rs-${Date.now()}-${++requestSeq}`;

    let settled = false;
    const cleanup = () => {
      window.removeEventListener(RESULT_EVENT, onResult as EventListener);
      // 主动清 marker 避免污染 DOM（main-world 处理后理论上不需要标记了）
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
          detail: { id, marker: MARKER_ATTR, newText },
        }),
      );
    } catch {
      settle(false);
      return;
    }

    // 超时兜底 —— main-world script 没装 / 处理 throw 未发回响应时不能挂死
    window.setTimeout(() => settle(false), REPLACE_TIMEOUT_MS);
  });
}
