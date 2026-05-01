import { ALL_STYLES, type Locale, STYLE_LABEL, type Style, t } from '@rewrite/shared';

export type CardState = 'pending' | 'streaming' | 'done' | 'error';

export interface CardData {
  style: Style;
  state: CardState;
  text: string;
  errorCode?: string;
}

export interface CandidatesCallbacks {
  /** 用户采纳某候选 */
  onSelect: (style: Style, finalText: string) => void;
  /** Esc 取消 */
  onCancel: () => void;
  /** 用户点击"安装扩展"hook（仅 web 模式有效，可选） */
  onInstallClick?: () => void;
}

export interface CandidatesHandle {
  appendDelta(style: Style, text: string): void;
  setDone(style: Style, finalText: string): void;
  setError(style: Style, code: string): void;
  /** 整体错误（如鉴权失败），3 卡片都标 error */
  setGlobalError(code: string): void;
  close(): void;
}

export interface OpenOptions {
  target: HTMLElement;
  locale: Locale;
  /** web 模式下 true，浮层底部显示"安装扩展"链接 */
  showInstallHook?: boolean;
}

export function createCandidates(
  root: ShadowRoot,
  callbacks: CandidatesCallbacks,
): {
  open: (opts: OpenOptions) => CandidatesHandle;
} {
  return {
    open(opts) {
      return openPanel(root, callbacks, opts);
    },
  };
}

function openPanel(
  root: ShadowRoot,
  callbacks: CandidatesCallbacks,
  opts: OpenOptions,
): CandidatesHandle {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', 'rewrite candidates');

  const cards: Map<Style, { root: HTMLElement; textEl: HTMLElement; data: CardData }> = new Map();

  for (let i = 0; i < ALL_STYLES.length; i++) {
    const style = ALL_STYLES[i] as Style;
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'option');
    card.dataset.style = style;

    const kbd = document.createElement('div');
    kbd.className = 'kbd';
    kbd.textContent = String(i + 1);

    const body = document.createElement('div');
    body.className = 'body';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = STYLE_LABEL[style][opts.locale];

    const textEl = document.createElement('div');
    textEl.className = 'text';
    // 初始 skeleton
    const sk1 = document.createElement('div');
    sk1.className = 'skeleton medium';
    const sk2 = document.createElement('div');
    sk2.className = 'skeleton short';
    sk2.style.marginTop = '6px';
    textEl.appendChild(sk1);
    textEl.appendChild(sk2);

    body.appendChild(label);
    body.appendChild(textEl);
    card.appendChild(kbd);
    card.appendChild(body);
    panel.appendChild(card);

    card.addEventListener('click', () => {
      const data = cards.get(style)?.data;
      if (data && (data.state === 'done' || data.state === 'streaming')) {
        callbacks.onSelect(style, data.text);
      }
    });

    cards.set(style, { root: card, textEl, data: { style, state: 'pending', text: '' } });
  }

  // 底部 hook（仅 web 模式）
  if (opts.showInstallHook) {
    const footer = document.createElement('div');
    footer.className = 'footer';
    const note = document.createElement('span');
    note.textContent = t('hint.tryOnAnyInput', opts.locale);
    const link = document.createElement('a');
    link.textContent = t('cta.installExtension', opts.locale);
    link.addEventListener('click', (e) => {
      e.preventDefault();
      callbacks.onInstallClick?.();
    });
    footer.appendChild(note);
    footer.appendChild(link);
    panel.appendChild(footer);
  }

  root.appendChild(panel);

  // 定位（自动选择上下）
  positionPanel(panel, opts.target);

  // 键盘事件（监听 window，capture 阶段）
  const onKeyDown = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onCancel();
      return;
    }
    // 数字键 1-3 直选
    const idx = ['1', '2', '3'].indexOf(e.key);
    if (idx >= 0) {
      const style = ALL_STYLES[idx];
      if (!style) return;
      const data = cards.get(style)?.data;
      if (data && (data.state === 'done' || data.state === 'streaming')) {
        e.preventDefault();
        e.stopPropagation();
        callbacks.onSelect(style, data.text);
      }
    }
  };
  window.addEventListener('keydown', onKeyDown, { capture: true });

  // 重定位（视口变化）
  const onScrollOrResize = () => positionPanel(panel, opts.target);
  window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });

  // 点击 shadow host 之外的任何地方（含原输入框）→ 关闭浮窗
  // closed shadow DOM 下，shadow 内的 click event 在外部观察到的 target 会被
  // retarget 成 shadow 的 host element。利用这点判断点击是否在浮层内。
  const shadowHost = root.host as Element | null;
  const onDocMouseDown = (ev: Event) => {
    const t = ev.target as Element | null;
    if (shadowHost && t && (t === shadowHost || shadowHost.contains(t))) return;
    callbacks.onCancel();
  };
  document.addEventListener('mousedown', onDocMouseDown, { capture: true });

  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    window.removeEventListener('scroll', onScrollOrResize, { capture: true });
    window.removeEventListener('resize', onScrollOrResize);
    document.removeEventListener('mousedown', onDocMouseDown, { capture: true });
    panel.remove();
  };

  return {
    appendDelta(style, text) {
      const entry = cards.get(style);
      if (!entry || closed) return;
      if (entry.data.state === 'pending') {
        entry.data.state = 'streaming';
        entry.textEl.innerHTML = '';
      }
      entry.data.text += text;
      entry.textEl.textContent = entry.data.text;
    },
    setDone(style, finalText) {
      const entry = cards.get(style);
      if (!entry || closed) return;
      entry.data.state = 'done';
      entry.data.text = finalText;
      entry.textEl.textContent = finalText;
    },
    setError(style, code) {
      const entry = cards.get(style);
      if (!entry || closed) return;
      entry.data.state = 'error';
      entry.data.errorCode = code;
      entry.root.classList.add('error');
      entry.textEl.innerHTML = '';
      const span = document.createElement('span');
      span.className = 'text dim';
      span.textContent = errorMessage(code, opts.locale);
      entry.textEl.appendChild(span);
    },
    setGlobalError(code) {
      for (const style of ALL_STYLES) this.setError(style, code);
    },
    close,
  };
}

function positionPanel(panel: HTMLElement, target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  // 先 render 一次拿到自然尺寸
  panel.style.visibility = 'hidden';
  panel.style.left = '0';
  panel.style.top = '0';
  // 强制回流
  const panelRect = panel.getBoundingClientRect();
  const panelW = panelRect.width || 360;
  const panelH = panelRect.height || 200;

  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  const spaceBelow = viewportH - rect.bottom;
  const spaceAbove = rect.top;
  const showAbove = spaceBelow < panelH + 8 && spaceAbove > spaceBelow;

  let top: number;
  if (showAbove) {
    top = Math.max(8, rect.top - panelH - 8);
  } else {
    top = Math.min(viewportH - panelH - 8, rect.bottom + 8);
  }

  let left = rect.left;
  // 不超出右边
  if (left + panelW > viewportW - 8) {
    left = Math.max(8, viewportW - panelW - 8);
  }
  if (left < 8) left = 8;

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.visibility = 'visible';
}

function errorMessage(code: string, locale: Locale): string {
  const map: Record<string, ReturnType<typeof t>> = {
    rate_limit: t('error.rateLimit', locale),
    quota_exceeded: t('error.quotaExceeded', locale),
    upstream_timeout: t('error.upstream', locale),
    upstream_error: t('error.upstream', locale),
    invalid_input: t('error.invalidInput', locale),
    input_too_long: t('error.tooLong', locale),
    unauthorized: t('error.unauthorized', locale),
    turnstile_failed: t('error.unauthorized', locale),
    internal_error: t('error.network', locale),
  };
  return map[code] ?? t('error.network', locale);
}
