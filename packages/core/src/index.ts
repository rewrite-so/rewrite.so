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
  let currentAbort: AbortController | null = null;
  let currentPanel: ReturnType<ReturnType<typeof createCandidates>['open']> | null = null;

  const candidates = createCandidates(root, {
    onSelect: (style, finalText) => {
      if (!activeEditable) return;
      const range = readEditable(activeEditable).hasSelection ? 'selection' : 'all';
      replaceEditable(activeEditable, finalText, range);
      currentPanel?.close();
      currentPanel = null;
      currentAbort?.abort();
      currentAbort = null;
      // 标识 style 已使用（暂留分析用）
      void style;
    },
    onCancel: () => {
      currentPanel?.close();
      currentPanel = null;
      currentAbort?.abort();
      currentAbort = null;
    },
    ...(opts.onInstallClick ? { onInstallClick: opts.onInstallClick } : {}),
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

  const handleTrigger = async () => {
    if (!activeEditable || !isUsableEditable(activeEditable)) return;

    // 取消上一次未完成的请求 + 关闭已开浮层（重新生成）
    currentAbort?.abort();
    currentPanel?.close();

    const target = activeEditable;
    const read = readEditable(target);
    if (!read.text.trim()) return;

    const targetLang = detectTargetLang({
      userPref: userPrefLang,
      el: target,
      sampleText: read.text.slice(0, 200),
    });

    const req: RewriteRequest = {
      text: read.text,
      hasSelection: read.hasSelection,
      lang: targetLang,
      styles: [...ALL_STYLES],
      ...(read.context ? { context: read.context } : {}),
      ...(opts.installId ? { installId: opts.installId } : {}),
    };

    const ac = new AbortController();
    currentAbort = ac;
    const panel = candidates.open({
      target,
      locale: uiLocale,
      ...(opts.showInstallHook ? { showInstallHook: opts.showInstallHook } : {}),
      ...(opts.loginUrl ? { loginUrl: opts.loginUrl } : {}),
    });
    currentPanel = panel;

    try {
      const stream = await opts.apiClient.rewrite(req, ac.signal);
      for await (const ev of parseSSEStream(stream)) {
        if (ac.signal.aborted) break;
        switch (ev.event) {
          case 'meta':
            // langDetected 等可用于浮层右上角显示，MVP 暂不渲染
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
      panel.setGlobalError(code, extractErrorDetail(err));
      opts.onError?.(err as Error);
    }
  };

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
      currentAbort?.abort();
      currentPanel?.close();
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
