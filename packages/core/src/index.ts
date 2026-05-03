import {
  ALL_STYLES,
  type Locale,
  parseSSEStream,
  type RewriteRequest,
  type Style,
} from '@rewrite/shared';
import { isUsableEditable } from './editable/detect.ts';
import { readEditable } from './editable/read.ts';
import { replaceEditable } from './editable/write.ts';
import { detectTargetLang } from './lang/detect.ts';
import type { RewriteApiClient } from './transport/api-client.ts';
import { attachDoubleShift } from './trigger/double-shift.ts';
import { createCandidates } from './ui/candidates.ts';
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
  /** 错误时显示登录 CTA 的目标 URL（如 web: '/login'，扩展: 'https://rewrite.so/login'） */
  loginUrl?: string;
  /** 浮层右上角齿轮点击时调用 —— 扩展传 chrome.runtime.openOptionsPage，web 传 跳 /settings */
  onOpenSettings?: () => void;
  onError?: (e: Error) => void;
}

export interface MountHandle {
  unmount: () => void;
}

const MOUNTED_FLAG = '__rewriteSoMounted';

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
  const dot = createDot(root, uiLocale);

  let activeEditable: HTMLElement | null = null;
  // 浮层打开期间锁定的 target editable —— 即使输入框失焦或被切换，浮层关闭前
  // 都用这个引用做 onSelect 的目标。activeEditable 仍跟踪 focus 用于 dot 显示。
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

  const candidates = createCandidates(root, {
    onSelect: (style, finalText) => {
      // 用浮层打开时锁定的 editable，避免被中途 focus 切换影响
      const target = lockedEditable;
      if (!target) return;
      // 如果焦点已离开 target（少见，例如用户 Cmd+Tab 切走），先 focus 回来
      // —— contenteditable 框架（Lexical/Slate/ProseMirror）通常要求目标 focused
      if (document.activeElement !== target) {
        try {
          target.focus({ preventScroll: true });
        } catch {
          /* 老浏览器无 preventScroll，忽略 */
        }
      }
      const range = readEditable(target).hasSelection ? 'selection' : 'all';
      replaceEditable(target, finalText, range);
      currentPanel?.close();
      currentPanel = null;
      lockedEditable = null;
      abortAllInflight();
      // 标识 style 已使用（暂留分析用）
      void style;
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
    ...(opts.onInstallClick ? { onInstallClick: opts.onInstallClick } : {}),
    ...(opts.onOpenSettings ? { onOpenSettings: opts.onOpenSettings } : {}),
  });

  const onFocusIn = (ev: Event) => {
    const target = ev.target as Element | null;
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
      if (!isUsableEditable(document.activeElement)) {
        activeEditable = null;
        dot.hide();
      }
    }, 50);
  };

  document.addEventListener('focusin', onFocusIn, { capture: true });
  document.addEventListener('focusout', onFocusOut, { capture: true });

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
            break;
          case 'delta':
            panel.appendDelta(ev.data.style, ev.data.text);
            break;
          case 'done':
            panel.setDone(ev.data.style, ev.data.finalText);
            break;
          case 'error':
            if (ev.data.style) panel.setError(ev.data.style, ev.data.code);
            else panel.setGlobalError(ev.data.code);
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
    if (!activeEditable || !isUsableEditable(activeEditable)) return;

    // 触发新一次：取消所有 in-flight + 关闭旧浮层
    abortAllInflight();
    currentPanel?.close();

    const target = activeEditable;
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

    const req: RewriteRequest = {
      ...lastRequestContext,
      styles: [...ALL_STYLES],
      ...(opts.installId ? { installId: opts.installId } : {}),
    };

    const ac = new AbortController();
    const panel = candidates.open({
      target,
      locale: uiLocale,
      // 客户端 detect 出的 target lang（chip 显示用）—— 服务端可能用账号偏好覆盖，
      // 但 chip 上显示客户端这个就够用：用户点齿轮去 settings 改即可
      targetLang,
      ...(opts.showInstallHook ? { showInstallHook: opts.showInstallHook } : {}),
      ...(opts.loginUrl ? { loginUrl: opts.loginUrl } : {}),
    });
    currentPanel = panel;

    await runRewrite(req, ac, panel, (code, detail) => panel.setGlobalError(code, detail));
  };

  /** 单卡 regenerate：仅 abort 当前 in-flight 中该 style 的（不影响其它）+ 重新单 style 请求 */
  async function regenerateOne(style: Style): Promise<void> {
    const panel = currentPanel;
    if (!panel || !lastRequestContext) return;

    panel.resetCard(style);

    const req: RewriteRequest = {
      ...lastRequestContext,
      styles: [style],
      ...(opts.installId ? { installId: opts.installId } : {}),
    };

    const ac = new AbortController();
    // 单卡 fatal → setError（错误卡仍可 Retry），不影响其它卡
    await runRewrite(req, ac, panel, (code) => panel.setError(style, code));
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
