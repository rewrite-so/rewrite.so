import { tCore as t } from '@rewrite/shared/core-i18n';
import type { Locale } from '@rewrite/shared/locales';

export interface DotController {
  /** 显示并跟随某输入框的右下角 */
  show(target: HTMLElement): void;
  /** 隐藏（但保留 DOM，等下次 show） */
  hide(): void;
  /** 完全销毁 */
  destroy(): void;
}

export interface DotOptions {
  /**
   * true → 在 dot 第一次 show() 时自动 popup tooltip 4 秒（onboarding 提示），
   * 之后只 hover 才显示。host 应通过 onFirstTooltipShown 回调持久化 flag。
   */
  showFirstTooltip?: boolean;
  /**
   * dot 首次自动 popup 触发时立即调（**不等 4 秒淡出**）。在开始时调能让 host
   * 的持久化写入与 popup 显示并行进行——若 4 秒内发生 unmount/remount，host 已
   * 经把 flag 落盘，新 mount 不会再 popup 一次。
   */
  onFirstTooltipShown?: () => void;
}

const DOT_SIZE = 10;
const DOT_OFFSET = 6; // 右下角偏移 px
const FIRST_TOOLTIP_DURATION_MS = 4000;

export function createDot(
  root: ShadowRoot,
  locale: Locale,
  options: DotOptions = {},
): DotController {
  const dot = document.createElement('div');
  dot.className = 'dot';
  dot.setAttribute('aria-hidden', 'true');
  dot.title = t('dot.title', locale);

  const tooltip = document.createElement('div');
  tooltip.className = 'dot-tooltip';
  // 用 kbd 包装 Shift 让 tooltip 看起来更精致
  const kbd1 = document.createElement('kbd');
  kbd1.textContent = 'Shift';
  const kbd2 = document.createElement('kbd');
  kbd2.textContent = 'Shift';
  const txt = document.createTextNode(t('dot.tooltipBrand', locale));
  tooltip.appendChild(kbd1);
  tooltip.appendChild(document.createTextNode(' '));
  tooltip.appendChild(kbd2);
  tooltip.appendChild(txt);

  root.appendChild(dot);
  root.appendChild(tooltip);

  let currentTarget: HTMLElement | null = null;
  let rafId = 0;
  let currentResizeObserver: ResizeObserver | null = null;
  let pendingFirstShow = options.showFirstTooltip === true;
  let firstTooltipTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const updatePosition = () => {
    rafId = 0;
    if (!currentTarget) return;
    const rect = currentTarget.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      dot.classList.remove('visible');
      return;
    }
    dot.style.left = `${rect.right - DOT_SIZE - DOT_OFFSET}px`;
    dot.style.top = `${rect.bottom - DOT_SIZE - DOT_OFFSET}px`;
    dot.classList.add('visible');
  };

  const requestUpdate = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(updatePosition);
  };

  const onScrollOrResize = () => requestUpdate();

  const onDotMouseEnter = () => {
    const r = dot.getBoundingClientRect();
    tooltip.style.left = `${r.left - tooltip.offsetWidth - 6}px`;
    tooltip.style.top = `${r.top + r.height / 2 - tooltip.offsetHeight / 2}px`;
    tooltip.classList.add('visible');
  };
  const onDotMouseLeave = () => {
    tooltip.classList.remove('visible');
  };

  dot.addEventListener('mouseenter', onDotMouseEnter);
  dot.addEventListener('mouseleave', onDotMouseLeave);

  return {
    show(target) {
      currentTarget = target;
      window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
      window.addEventListener('resize', onScrollOrResize, { passive: true });
      // Track target's own size changes — textareas auto-grow as the user types,
      // contenteditable rich editors reflow on newline, etc. Without this the
      // dot stays glued to the original right-bottom and visibly drifts.
      currentResizeObserver?.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        currentResizeObserver = new ResizeObserver(() => requestUpdate());
        currentResizeObserver.observe(target);
      }
      requestUpdate();

      // First-show onboarding: auto-popup the tooltip so the user sees the
      // brand + shortcut hint without having to discover hover. Persisting
      // the flag is the host's job; we fire onFirstTooltipShown immediately
      // (not on the 4s timeout) so a same-tick remount doesn't re-pop.
      if (pendingFirstShow) {
        pendingFirstShow = false;
        // Wait one frame for layout so onDotMouseEnter can compute tooltip
        // position from a real bounding rect.
        requestAnimationFrame(() => {
          onDotMouseEnter();
        });
        options.onFirstTooltipShown?.();
        firstTooltipTimeoutId = setTimeout(() => {
          tooltip.classList.remove('visible');
          firstTooltipTimeoutId = null;
        }, FIRST_TOOLTIP_DURATION_MS);
      }
    },
    hide() {
      currentTarget = null;
      dot.classList.remove('visible');
      tooltip.classList.remove('visible');
      window.removeEventListener('scroll', onScrollOrResize, { capture: true });
      window.removeEventListener('resize', onScrollOrResize);
      currentResizeObserver?.disconnect();
      currentResizeObserver = null;
    },
    destroy() {
      this.hide();
      if (firstTooltipTimeoutId !== null) {
        clearTimeout(firstTooltipTimeoutId);
        firstTooltipTimeoutId = null;
      }
      dot.removeEventListener('mouseenter', onDotMouseEnter);
      dot.removeEventListener('mouseleave', onDotMouseLeave);
      dot.remove();
      tooltip.remove();
    },
  };
}
