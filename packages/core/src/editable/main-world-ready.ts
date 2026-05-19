/**
 * Main-world ready signal —— 给 isolated world 的 draft / lexical / paste adapter 共享。
 *
 * main-world.ts mount 时给 `documentElement` 设 `data-rewrite-so-main-world-ready=1`
 * （DOM attribute 跨 world 共享）+ dispatch 一次性 `rewrite-so:main-world-ready` 事件。
 *
 * `waitForMainWorldReady()` 用 module-level promise cache —— 3 个 adapter 共享同一个
 * pending promise，最多等一次 READY_WAIT_MS。不 cache 的话 paste → lexical → draft
 * 三层 fallback 最坏累加 1.5s 卡顿。
 */

export const READY_EVENT = 'rewrite-so:main-world-ready';
export const READY_ATTR = 'data-rewrite-so-main-world-ready';

/**
 * 等 main-world 准备好的最长等待（ms）。Chrome 不保证同 manifest 内多 content_script
 * entry 的注入顺序，inject.ts 可能先于 main-world.ts 运行。500ms 远大于实测
 * 的注入间隔（< 10ms），同时短到对用户不可感知；超时仍尝试 dispatch（让
 * 各 adapter 自己的 REPLACE_TIMEOUT 做最终兜底）。
 */
export const READY_WAIT_MS = 500;

/**
 * 同步检查 main-world script 是否已 ready —— attribute 跨 world 共享。
 */
export function isMainWorldReady(): boolean {
  return !!document.documentElement?.hasAttribute(READY_ATTR);
}

let readyPromise: Promise<void> | null = null;

/**
 * 等到 main-world ready，或超时（无论如何返回，让上层超时机制兜底）。
 * 已 ready 时立即 resolve，不引入额外延迟。
 *
 * Module-level promise cache：3 个 adapter（paste / lexical / draft）共享同一个
 * pending promise —— 冷启动只等一次 READY_WAIT_MS，后续调用直接拿到已 resolved
 * 的 promise，零延迟。
 */
export function waitForMainWorldReady(): Promise<void> {
  if (isMainWorldReady()) return Promise.resolve();
  if (!readyPromise) {
    readyPromise = new Promise<void>((resolve) => {
      const finish = () => {
        window.removeEventListener(READY_EVENT, onReady);
        resolve();
      };
      const onReady = () => finish();
      window.addEventListener(READY_EVENT, onReady, { once: true });
      window.setTimeout(finish, READY_WAIT_MS);
    });
  }
  return readyPromise;
}
