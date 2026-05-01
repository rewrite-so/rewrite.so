import { type I18nKey, type Locale, t } from '@rewrite/shared';

export interface DotController {
  /** 显示并跟随某输入框的右下角 */
  show(target: HTMLElement): void;
  /** 隐藏（但保留 DOM，等下次 show） */
  hide(): void;
  /** 完全销毁 */
  destroy(): void;
}

const DOT_OFFSET = 4; // 右下角偏移 px
const TOOLTIP_KEY: I18nKey = 'hint.doubleShift';

export function createDot(root: ShadowRoot, locale: Locale): DotController {
  const dot = document.createElement('div');
  dot.className = 'dot';
  dot.setAttribute('aria-hidden', 'true');

  const tooltip = document.createElement('div');
  tooltip.className = 'dot-tooltip';
  tooltip.textContent = t(TOOLTIP_KEY, locale);

  root.appendChild(dot);
  root.appendChild(tooltip);

  let currentTarget: HTMLElement | null = null;
  let rafId = 0;

  const updatePosition = () => {
    rafId = 0;
    if (!currentTarget) return;
    const rect = currentTarget.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      dot.classList.remove('visible');
      return;
    }
    dot.style.left = `${rect.right - 8 - DOT_OFFSET}px`;
    dot.style.top = `${rect.bottom - 8 - DOT_OFFSET}px`;
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
      requestUpdate();
    },
    hide() {
      currentTarget = null;
      dot.classList.remove('visible');
      tooltip.classList.remove('visible');
      window.removeEventListener('scroll', onScrollOrResize, { capture: true });
      window.removeEventListener('resize', onScrollOrResize);
    },
    destroy() {
      this.hide();
      dot.removeEventListener('mouseenter', onDotMouseEnter);
      dot.removeEventListener('mouseleave', onDotMouseLeave);
      dot.remove();
      tooltip.remove();
    },
  };
}
