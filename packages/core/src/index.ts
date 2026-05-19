import type { RewriteRequest } from '@rewrite/shared/api-contract';
import type { Locale } from '@rewrite/shared/locales';
import { parseSSEStream } from '@rewrite/shared/sse-frame';
import { ALL_STYLES, type Style } from '@rewrite/shared/styles';
import { isUsableEditable } from './editable/detect.ts';
import { readEditable } from './editable/read.ts';
import { replaceEditable } from './editable/write.ts';
import { detectTargetLang } from './lang/detect.ts';
import type { RewriteApiClient } from './transport/api-client.ts';
import { attachDoubleShift } from './trigger/double-shift.ts';
import { createCandidates, isRetryableError } from './ui/candidates.ts';
import { createDot } from './ui/dot.ts';
import { createShadowRoot } from './ui/shadow.ts';

export type Host = 'extension' | 'web';
export type ShadowMode = 'closed' | 'open';

export interface MountOptions {
  host: Host;
  apiClient: RewriteApiClient;
  shadowMode?: ShadowMode;
  /** 用户偏好目标语言；'auto' 触发自动检测 */
  userPrefLang?: string;
  uiLocale?: Locale;
  /** 扩展安装 ID（匿名维度），rewrite 请求会带上 */
  installId?: string;
  /** web 模式下浮层底部显示"安装扩展"链接 */
  showInstallHook?: boolean;
  onInstallClick?: () => void;
  /** web 匿名体验页的人机校验 token；扩展端和登录用户通常不传 */
  getTurnstileToken?: () => Promise<string | undefined>;
  /** 错误时显示登录 CTA 的目标 URL（如 web: '/login'，扩展: 'https://rewrite.so/login'） */
  loginUrl?: string;
  /** 已登录用户超配额时引导去配 BYOK / 升 Pro 的 URL（如 web: '/settings'，扩展: '${WEB_BASE}/settings'） */
  upgradeUrl?: string;
  /** 浮层右上角齿轮点击时调用 —— 扩展传 chrome.runtime.openOptionsPage，web 传 跳 /settings */
  onOpenSettings?: () => void;
  /**
   * SSE meta.status.userTargetLang 收到时调用（仅登录用户）。
   * 扩展端实现：把值写回 chrome.storage 实现 web ↔ extension 实时同步。
   * web 端不需要实现（user_settings 是 web 这边的源头）。
   */
  onUserPrefsSync?: (prefs: { targetLang: string }) => void;
  /**
   * true → 扩展端 dot 在用户首次聚焦输入框、dot 出现时自动 popup tooltip
   * 4 秒（onboarding 提示，"Shift Shift to rewrite.so"）。host 应通过
   * onFirstDotTooltipShown 回调持久化 flag，避免下次 mount 再次 popup。
   * web /try 模式不传（已有底部 install hint，不需要 dot onboarding）。
   */
  showFirstDotTooltip?: boolean;
  /** dot 首次 popup 触发时立即调（不等淡出），让 host 落 flag。 */
  onFirstDotTooltipShown?: () => void;
  /**
   * 用户接受了某个候选改写后调用（panel close、editable 替换之后）。
   * 给 host 一个统计/转化埋点（如 web /try 用 onAccepted 累计匿名用户成功
   * 改写次数，触发"登录解锁更多"引导）。可选，扩展端不需实现。
   *
   * **不传 finalText** —— 隐私契约（CLAUDE.md "完全不记录原文"）禁止原文
   * 流入 host telemetry。仅传 style 让 host 知道"用户接受了哪种风格"。
   */
  onAccepted?: (style: Style) => void;
  onError?: (e: Error) => void;
}

export interface MountHandle {
  unmount: () => void;
}

const MOUNTED_FLAG = '__rewriteSoMounted';

/**
 * 找出真正聚焦的元素，穿透 shadow DOM。
 *
 * `document.activeElement` 默认会被 retarget 到 shadow host —— 当真实焦点在
 * shadow DOM 内（如 Reddit `<faceplate-textarea-input>` 内的 `<textarea>`），
 * 我们看不到真实的 input/textarea。递归 `.shadowRoot.activeElement` 取最深层焦点。
 * Closed shadow root 上 `.shadowRoot` 是 null，递归自动停止。
 */
function deepActiveElement(root: Document | ShadowRoot = document): Element | null {
  let active: Element | null = root.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

/**
 * 从 focusin event 取真实聚焦元素。composedPath() 在 composed event 上能返回
 * shadow DOM 内的真实节点序列；`event.target` 已被 retarget 到 shadow host。
 */
function focusedTargetFromEvent(ev: FocusEvent): Element | null {
  const path = ev.composedPath?.();
  if (path && path.length > 0) {
    for (const n of path) {
      if (n instanceof Element) return n;
    }
  }
  return ev.target as Element | null;
}

export function mount(opts: MountOptions): MountHandle {
  // 防 Next dev 热更新重复挂载
  const g = globalThis as unknown as Record<string, unknown>;
  if (g[MOUNTED_FLAG]) {
    return { unmount: () => undefined };
  }
  g[MOUNTED_FLAG] = true;

  const shadowMode = opts.shadowMode ?? (opts.host === 'extension' ? 'closed' : 'open');
  const uiLocale: Locale = opts.uiLocale ?? 'en';
  const userPrefLang = opts.userPrefLang ?? 'auto';

  const { root } = createShadowRoot(shadowMode);
  // dot.onActivate is wired below to handleTrigger (declared further down)
  // via a forward closure — handleTrigger isn't in scope yet.
  const dot = createDot(root, uiLocale, {
    showFirstTooltip: opts.showFirstDotTooltip,
    onFirstTooltipShown: opts.onFirstDotTooltipShown,
    onActivate: () => {
      void handleTrigger();
    },
  });

  // 当前 dot 显示的目标元素；由 focusin/focusout 即时维护。**不**作为 handleTrigger
  // 的改写 target —— 后者走 deepActiveElement() 实时读取，避免 Reddit 嵌套 shadow
  // DOM 模态框 / SPA ref.focus() 切焦等场景下 focusin 时序异常引起 stale。
  let activeEditable: HTMLElement | null = null;
  // 浮层打开期间锁定的 target editable —— 即使输入框失焦或被切换，浮层关闭前
  // 都用这个引用做 onSelect 的目标。
  let lockedEditable: HTMLElement | null = null;
  // 多个 in-flight 请求并存：首发 3-style + 任意数量的单卡 regen
  // Esc / onSelect / unmount 时全部 abort + clear
  const inflightAborts = new Set<AbortController>();
  let currentPanel: ReturnType<ReturnType<typeof createCandidates>['open']> | null = null;
  // 缓存首发请求的 lang / context / hasSelection，给后续 regen 复用
  let lastRequestContext: {
    text: string;
    hasSelection: boolean;
    lang: string;
    context?: string;
  } | null = null;

  function abortAllInflight() {
    for (const ac of inflightAborts) ac.abort();
    inflightAborts.clear();
  }

  // P0-1 re-entry guard：onSelect 内 await replaceEditable 期间（paste 探针 ~80ms +
  // fallback 链可达 150ms），用户可能再次点击 / 按 keyboard 1/2/3 触发第二次 onSelect。
  // candidates.ts trySelectStyle 已加 panel.applying 阻断，本 flag 是双层防御 +
  // 兼容 panel.applying 在 globalError 路径被 wipe 后的边界 case。
  let isApplyingWrite = false;

  /**
   * P0-3 globalError race 修复：所有 panel.setGlobalError 调用都走此 helper，统一
   * 清理 applying 期间残留状态（inflight aborts + isApplyingWrite flag）。
   *
   * 为什么需要：onSelect 内 await replaceEditable 期间，SSE 可能 deliver 延迟的
   * quota_exceeded → panel.setGlobalError → panel.innerHTML 被 wipe 进入全局错误态。
   * 旧 onSelect 还在 await，但 panel 已不是原 candidates 视图。await 结束时
   * setWriteFailed 调到的是被 wipe 的 entry（已 detached），setWriteFailed 内
   * `if (closed || globalErrored) return` 早返跳过 —— 但 finally 之前 `isApplyingWrite`
   * 仍是 true。**如果此期间用户触发新的双击 Shift → handleTrigger 重建 panel +
   * 新 onSelect 进入**，第二次 onSelect 顶部 `if (isApplyingWrite) return` 会把新
   * trigger 整个吞掉。本 helper 在 globalError 转移时立即清 flag，让新 trigger
   * 路径不被旧 onSelect 的 stale flag 阻塞。lockedEditable 故意保留供 onRetryAll
   * 复用（handleTrigger 不查 isApplyingWrite，retryAll 直接拿 lockedEditable 重启）。
   */
  function transitionToGlobalError(
    panel: NonNullable<typeof currentPanel>,
    code: string,
    detail?: Record<string, unknown>,
  ): void {
    panel.setGlobalError(code, detail);
    isApplyingWrite = false;
    abortAllInflight();
  }

  const candidates = createCandidates(
    root,
    {
      onSelect: async (style, finalText) => {
        // 双层 re-entry guard：candidates.ts panel.applying CSS class 是第一层（阻断
        // mouse click + keyboard 1/2/3 调 trySelectStyle）；这里 flag 是第二层（兜底
        // 万一 panel class 被 globalError 状态机 wipe 但 onSelect 仍被调用）
        if (isApplyingWrite) return;
        // 用浮层打开时锁定的 editable，避免被中途 focus 切换影响
        const target = lockedEditable;
        if (!target) return;
        // 如果焦点已离开 target（少见，例如用户 Cmd+Tab 切走），先 focus 回来
        // —— contenteditable 框架（Lexical/Slate/ProseMirror）通常要求目标 focused。
        // 用 deepActiveElement 比较：target 在 shadow DOM 内时 document.activeElement
        // 是 shadow host，永远 !== target，会触发冗余 focus 调用。
        if (deepActiveElement() !== target) {
          try {
            target.focus({ preventScroll: true });
          } catch {
            /* 老浏览器无 preventScroll，忽略 */
          }
        }
        const range = readEditable(target).hasSelection ? 'selection' : 'all';
        // 立即给 Apply 按钮 spinner + disable —— 用户点击后看到 loading 而不是
        // 浮窗无响应。replaceEditable 可能 ~50-150ms（fallback 路径有 rAF 探针延迟）
        currentPanel?.setApplying(style);
        isApplyingWrite = true;
        try {
          const ok = await replaceEditable(target, finalText, range);
          if (ok) {
            currentPanel?.close();
            currentPanel = null;
            lockedEditable = null;
            abortAllInflight();
            // 通知 host 用户接受了改写（onAccepted optional；扩展不实现）。
            // 必须在 replaceEditable 成功之后—— !target early return 或写入失败时
            // 不应触发 "accepted" 事件
            opts.onAccepted?.(style);
          } else {
            // 写入失败（所有 fallback 都失败）—— 浮窗保持打开，显示 Copy 按钮
            // 让用户手动复制兜底；不静默关闭让用户困惑
            currentPanel?.setWriteFailed(style, finalText);
          }
        } finally {
          isApplyingWrite = false;
        }
      },
      onCancel: () => {
        currentPanel?.close();
        currentPanel = null;
        lockedEditable = null;
        abortAllInflight();
      },
      onRegenerate: (style) => {
        void regenerateOne(style);
      },
      onRetryAll: () => {
        void retryAll();
      },
      ...(opts.onInstallClick ? { onInstallClick: opts.onInstallClick } : {}),
      ...(opts.onOpenSettings ? { onOpenSettings: opts.onOpenSettings } : {}),
    },
    {
      hintStorage: opts.host === 'extension' ? null : undefined,
    },
  );

  const onFocusIn = (ev: Event) => {
    // 用 composedPath 取真实焦点元素，绕开 shadow host retarget
    const target = focusedTargetFromEvent(ev as FocusEvent);
    if (isUsableEditable(target)) {
      activeEditable = target;
      dot.show(target);
    } else {
      activeEditable = null;
      dot.hide();
    }
  };
  const onFocusOut = () => {
    // blur 后稍延迟检查，因为切换输入框时 focusout → focusin 是连续的
    setTimeout(() => {
      if (!isUsableEditable(deepActiveElement())) {
        activeEditable = null;
        dot.hide();
      }
    }, 50);
  };

  document.addEventListener('focusin', onFocusIn, { capture: true });
  document.addEventListener('focusout', onFocusOut, { capture: true });

  // 兜底：mount 时焦点可能已落在可改写输入框（如 Google `<textarea autofocus>` /
  // Reddit shadow-DOM 内的 title 框 —— SPA 在 document_idle 前已渲染且把焦点 set
  // 到输入框）。focusin 早于我们 listener 注册，需主动 sync 一次。
  const initialActive = deepActiveElement();
  if (isUsableEditable(initialActive)) {
    activeEditable = initialActive;
    dot.show(initialActive);
  }

  /**
   * 跑一次 rewrite（首发 3-style 或单卡 regen 都走这里）。
   * 错误处理策略由 onError 回调决定：首发整路 fail → setGlobalError；
   * 单卡 regen 整路 fail → setError(style)。
   */
  async function runRewrite(
    req: RewriteRequest,
    ac: AbortController,
    panel: NonNullable<typeof currentPanel>,
    onFatal: (code: string, detail?: Record<string, unknown>) => void,
  ): Promise<void> {
    inflightAborts.add(ac);
    try {
      const stream = await opts.apiClient.rewrite(req, ac.signal);
      for await (const ev of parseSSEStream(stream)) {
        if (ac.signal.aborted) break;
        switch (ev.event) {
          case 'meta':
            // 服务端权威 echo —— 登录用户的 DB 偏好优先于客户端 chrome.storage cache；
            // chip 跟服务端走，避免 cache 与 DB 不一致时显示错误的 target lang
            panel.setLangDetected(ev.data.langDetected);
            if (ev.data.status) {
              panel.setStatus(ev.data.status);
              // 实时跨端同步：服务端 echo 用户在 user_settings 里的 target_lang，
              // 让扩展把它写回 chrome.storage。下次 inject 重 mount 时立即生效
              if (ev.data.status.userTargetLang !== undefined) {
                opts.onUserPrefsSync?.({ targetLang: ev.data.status.userTargetLang });
              }
            }
            break;
          case 'delta':
            panel.appendDelta(ev.data.style, ev.data.text);
            break;
          case 'done':
            panel.setDone(ev.data.style, ev.data.finalText);
            break;
          case 'error':
            if (ev.data.style) panel.setError(ev.data.style, ev.data.code);
            else transitionToGlobalError(panel, ev.data.code);
            break;
          case 'end':
            // 终止流（部分 done 已渲染）
            break;
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // 用户取消
      // ApiError（HTTP 4xx/5xx）解析 detailObj 拿到 error code
      const code = extractErrorCode(err);
      onFatal(code, extractErrorDetail(err));
      opts.onError?.(err as Error);
    } finally {
      inflightAborts.delete(ac);
    }
  }

  const handleTrigger = async () => {
    // 触发瞬间实时拿真实焦点，不依赖 onFocusIn 维护的 activeEditable ——
    // 后者在某些场景（Reddit 创建 subreddit 弹窗这类嵌套 shadow DOM 模态框 /
    // SPA 用 ref.focus() 编程式切焦时 focusin 时序异常）可能 stale，
    // 导致改写错误的元素（如焦点在 description 但改写 title）。
    // dot.show / activeEditable 仍跟 focusin 走（即时驱动 UI），但 handleTrigger
    // 的"target 是谁"由当下 deepActiveElement 单一权威决定。
    const currentTarget = deepActiveElement();
    if (!isUsableEditable(currentTarget)) return;

    // 触发新一次：取消所有 in-flight + 关闭旧浮层
    abortAllInflight();
    currentPanel?.close();

    const target = currentTarget;
    // 锁定 target —— 浮层期间 onSelect 一直用它，不受 focus 切换影响
    lockedEditable = target;
    const read = readEditable(target);
    if (!read.text.trim()) return;

    const targetLang = detectTargetLang({
      userPref: userPrefLang,
      el: target,
      sampleText: read.text.slice(0, 200),
    });

    // 缓存请求上下文，给后续 regen 复用
    lastRequestContext = {
      text: read.text,
      hasSelection: read.hasSelection,
      lang: targetLang,
      ...(read.context ? { context: read.context } : {}),
    };

    // 先开浮层（用户立即看到 skeleton），再 await turnstile token——
    // turnstile invisible challenge 偶尔 timeout（10 秒）/ 失败，如果先 await 再开
    // 浮层，用户双击 Shift 后等很久看到的是"什么都没发生"，无法 setGlobalError 反馈。
    // panel 先打开后失败时走 setGlobalError('turnstile_failed') 跟 regenerateOne 路径对齐
    const ac = new AbortController();
    const panel = candidates.open({
      target,
      locale: uiLocale,
      // 客户端 detect 出的 target lang（chip 显示用）—— 服务端可能用账号偏好覆盖，
      // 但 chip 上显示客户端这个就够用：用户点齿轮去 settings 改即可
      targetLang,
      ...(opts.showInstallHook ? { showInstallHook: opts.showInstallHook } : {}),
      ...(opts.loginUrl ? { loginUrl: opts.loginUrl } : {}),
      ...(opts.upgradeUrl ? { upgradeUrl: opts.upgradeUrl } : {}),
    });
    currentPanel = panel;

    let turnstileToken: string | undefined;
    try {
      turnstileToken = await opts.getTurnstileToken?.();
    } catch (err) {
      transitionToGlobalError(panel, 'turnstile_failed');
      opts.onError?.(err as Error);
      return;
    }

    const req: RewriteRequest = {
      ...lastRequestContext,
      styles: [...ALL_STYLES],
      ...(opts.installId ? { installId: opts.installId } : {}),
      ...(turnstileToken ? { turnstileToken } : {}),
    };

    await runRewrite(req, ac, panel, (code, detail) => transitionToGlobalError(panel, code, detail));
  };

  /** 单卡 regenerate：仅 abort 当前 in-flight 中该 style 的（不影响其它）+ 重新单 style 请求 */
  async function regenerateOne(style: Style): Promise<void> {
    const panel = currentPanel;
    if (!panel || !lastRequestContext) return;

    panel.resetCard(style);

    let turnstileToken: string | undefined;
    try {
      turnstileToken = await opts.getTurnstileToken?.();
    } catch (err) {
      transitionToGlobalError(panel, 'turnstile_failed');
      opts.onError?.(err as Error);
      return;
    }

    const req: RewriteRequest = {
      ...lastRequestContext,
      styles: [style],
      ...(opts.installId ? { installId: opts.installId } : {}),
      ...(turnstileToken ? { turnstileToken } : {}),
    };

    const ac = new AbortController();
    // 单卡 fatal 处理：
    // - 可重试错误（upstream/timeout/network/rate_limit）→ setError 显示 Retry 按钮，
    //   保留其它卡片正常状态
    // - 不可重试错误（quota_exceeded / unauthorized）→ 升级到 transitionToGlobalError 显示
    //   正确 CTA（"Configure BYOK or upgrade" / "Sign in"），避免单卡 Retry 死循环
    await runRewrite(req, ac, panel, (code, detail) => {
      if (isRetryableError(code)) {
        panel.setError(style, code);
      } else {
        transitionToGlobalError(panel, code, detail);
      }
    });
  }

  /**
   * 整组 retry：用户在 setGlobalError 卡片上点 Retry → 关掉错误浮层 + 重新触发改写。
   * 浮层期间用户可能切走焦点，所以 retry 前必须先把焦点 focus 回 lockedEditable ——
   * handleTrigger 走 deepActiveElement() 读取真实焦点，若焦点已离开则会直接 return。
   */
  function retryAll(): void {
    if (!lockedEditable) return;
    // 把焦点 focus 回来，让 handleTrigger 的 deepActiveElement() 能拿到正确 target
    try {
      lockedEditable.focus({ preventScroll: true });
    } catch {
      /* 老浏览器无 preventScroll，忽略 */
    }
    // 关闭当前错误浮层，让 handleTrigger 创建新 panel + 重新跑首发流程
    currentPanel?.close();
    currentPanel = null;
    abortAllInflight();
    void handleTrigger();
  }

  function extractErrorCode(err: unknown): string {
    if (err && typeof err === 'object' && 'detailObj' in err) {
      const d = (err as { detailObj?: Record<string, unknown> | null }).detailObj;
      const code = d?.error;
      if (typeof code === 'string') return code;
    }
    return 'upstream_error';
  }
  function extractErrorDetail(err: unknown): Record<string, unknown> | undefined {
    if (err && typeof err === 'object' && 'detailObj' in err) {
      const d = (err as { detailObj?: Record<string, unknown> | null }).detailObj;
      if (d && typeof d === 'object') return d;
    }
    return undefined;
  }

  const trigger = attachDoubleShift(window, { onTrigger: handleTrigger });

  return {
    unmount() {
      g[MOUNTED_FLAG] = false;
      trigger.detach();
      document.removeEventListener('focusin', onFocusIn, { capture: true });
      document.removeEventListener('focusout', onFocusOut, { capture: true });
      abortAllInflight();
      currentPanel?.close();
      lockedEditable = null;
      dot.destroy();
    },
  };
}

// re-exports for consumers
export type { RewriteApiClient } from './transport/api-client.ts';
export { createWebApiClient } from './transport/api-client.ts';
// onboarding 等场景需要单独使用 trigger
export {
  attachDoubleShift,
  type DoubleShiftHandle,
  type DoubleShiftOptions,
} from './trigger/double-shift.ts';
export type { Style };
