import {
  ALL_STYLES,
  type Locale,
  STYLE_LABEL,
  STYLE_SUBLABEL,
  type Style,
  t,
} from '@rewrite/shared';

type ActionMode = 'hidden' | 'streaming' | 'regen' | 'retry';

const SHORTCUT_HINT_STORAGE_KEY = '__rewrite_so_shortcuts_shown_v1';
const SHORTCUT_HINT_MAX_SHOWS = 3;

function shouldShowShortcutHint(): boolean {
  try {
    const n = Number(localStorage.getItem(SHORTCUT_HINT_STORAGE_KEY) ?? '0');
    return Number.isFinite(n) && n < SHORTCUT_HINT_MAX_SHOWS;
  } catch {
    return false;
  }
}
function markShortcutHintShown(): void {
  try {
    const n = Number(localStorage.getItem(SHORTCUT_HINT_STORAGE_KEY) ?? '0');
    localStorage.setItem(SHORTCUT_HINT_STORAGE_KEY, String(Number.isFinite(n) ? n + 1 : 1));
  } catch {
    /* localStorage 不可用 */
  }
}

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
  /** 用户点击单卡 ↻/Retry → 该 style 重新生成 */
  onRegenerate?: (style: Style) => void;
}

export interface CandidatesHandle {
  appendDelta(style: Style, text: string): void;
  setDone(style: Style, finalText: string): void;
  setError(style: Style, code: string): void;
  /** 把单卡复位回 pending（skeleton），用于 regen 启动时清空 */
  resetCard(style: Style): void;
  /** SSE meta 事件来到时设置目标语言；与 OpenOptions.sourceLang 比较，跨语言时显示"zh → en"小字 */
  setLangDetected(target: string): void;
  /** 整体错误：替换整个浮层为单一错误卡片（含 CTA 链接，按 code 决定文案） */
  setGlobalError(code: string, detail?: Record<string, unknown>): void;
  close(): void;
}

export interface OpenOptions {
  target: HTMLElement;
  locale: Locale;
  /** web 模式下 true，浮层底部显示"安装扩展"链接 */
  showInstallHook?: boolean;
  /** 登录引导 URL（错误状态显示登录 CTA 时跳转） */
  loginUrl?: string;
  /** 源文本检测到的语言（如 "zh"/"en"），用于浮层右上角显示 "zh → en" */
  sourceLang?: string;
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

  // 语言徽章（默认隐藏，meta event 来后若 source≠target 才显示）
  const langBadge = document.createElement('div');
  langBadge.className = 'lang-badge';
  langBadge.style.display = 'none';
  panel.appendChild(langBadge);

  const cards: Map<
    Style,
    { root: HTMLElement; textEl: HTMLElement; actionEl: HTMLButtonElement; data: CardData }
  > = new Map();

  function fillSkeleton(textEl: HTMLElement) {
    textEl.innerHTML = '';
    const sk1 = document.createElement('div');
    sk1.className = 'skeleton medium';
    const sk2 = document.createElement('div');
    sk2.className = 'skeleton short';
    sk2.style.marginTop = '6px';
    textEl.appendChild(sk1);
    textEl.appendChild(sk2);
  }

  function setActionMode(actionEl: HTMLButtonElement, mode: ActionMode) {
    actionEl.className = `card-action card-action-${mode}`;
    if (mode === 'hidden') {
      actionEl.style.display = 'none';
      actionEl.setAttribute('aria-disabled', 'true');
      return;
    }
    actionEl.style.display = '';
    if (mode === 'streaming') {
      actionEl.innerHTML = '<span class="card-action-spinner" aria-hidden="true"></span>';
      actionEl.setAttribute('aria-disabled', 'true');
      actionEl.title = '';
    } else if (mode === 'regen') {
      actionEl.textContent = '↻';
      actionEl.setAttribute('aria-disabled', 'false');
      actionEl.title = t('core.regen', opts.locale);
      actionEl.setAttribute('aria-label', t('core.regen', opts.locale));
    } else if (mode === 'retry') {
      actionEl.textContent = t('core.retry', opts.locale);
      actionEl.setAttribute('aria-disabled', 'false');
      actionEl.title = '';
      actionEl.setAttribute('aria-label', t('core.retry', opts.locale));
    }
  }

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
    const labelMain = document.createElement('span');
    labelMain.className = 'label-main';
    labelMain.textContent = STYLE_LABEL[style][opts.locale];
    const labelSub = document.createElement('span');
    labelSub.className = 'label-sub';
    labelSub.textContent = ` · ${STYLE_SUBLABEL[style][opts.locale]}`;
    label.appendChild(labelMain);
    label.appendChild(labelSub);

    const textEl = document.createElement('div');
    textEl.className = 'text';
    fillSkeleton(textEl);

    const actionEl = document.createElement('button');
    actionEl.type = 'button';
    setActionMode(actionEl, 'hidden');
    actionEl.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (actionEl.getAttribute('aria-disabled') === 'true') return;
      callbacks.onRegenerate?.(style);
    });

    body.appendChild(label);
    body.appendChild(textEl);
    card.appendChild(kbd);
    card.appendChild(body);
    card.appendChild(actionEl);
    panel.appendChild(card);

    card.addEventListener('click', (ev) => {
      // 点击 action button 不触发 onSelect
      if (ev.target === actionEl || actionEl.contains(ev.target as Node)) return;
      const data = cards.get(style)?.data;
      if (data && (data.state === 'done' || data.state === 'streaming')) {
        callbacks.onSelect(style, data.text);
      }
    });

    cards.set(style, {
      root: card,
      textEl,
      actionEl,
      data: { style, state: 'pending', text: '' },
    });
  }

  // 首次使用提示（前 3 次显示）—— 教用户 1/2/3 接受、↻ 重生成、Esc 取消
  if (shouldShowShortcutHint()) {
    const hint = document.createElement('div');
    hint.className = 'shortcut-hint';
    hint.textContent = t('core.shortcuts', opts.locale)
      .replace('{accept}', '1/2/3')
      .replace('{regen}', '↻')
      .replace('{cancel}', 'Esc');
    panel.appendChild(hint);
    markShortcutHintShown();
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
        // 此时清空旧内容（首发的 skeleton 或 regen 保留的旧文本/错误信息）
        entry.textEl.innerHTML = '';
        entry.root.classList.remove('regenerating');
        setActionMode(entry.actionEl, 'streaming');
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
      setActionMode(entry.actionEl, 'regen');
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
      setActionMode(entry.actionEl, 'retry');
    },
    resetCard(style) {
      const entry = cards.get(style);
      if (!entry || closed) return;
      // 软重置：保留旧文本（done 时是好结果，error 时是错误信息），让用户视觉上
      // 看到"旧内容变暗等待替换"而不是"啪一下消失"。首个 delta 来时
      // appendDelta 会清空 textEl + 移除 .regenerating class
      entry.data.state = 'pending';
      entry.data.text = '';
      entry.data.errorCode = undefined;
      entry.root.classList.remove('error');
      entry.root.classList.add('regenerating');
      setActionMode(entry.actionEl, 'streaming');
    },
    setLangDetected(target) {
      if (closed) return;
      const source = opts.sourceLang;
      if (!source || !target) return;
      // 比较"language family"——主标签 prefix（zh-CN 与 zh-TW 都视为 zh）
      const srcFam = source.toLowerCase().split('-')[0];
      const tgtFam = target.toLowerCase().split('-')[0];
      if (!srcFam || !tgtFam || srcFam === tgtFam) return;
      langBadge.textContent = `${srcFam} → ${tgtFam}`;
      langBadge.style.display = '';
    },
    setGlobalError(code, detail) {
      if (closed) return;
      // 替换整个浮层为单一错误卡片 + CTA
      panel.innerHTML = '';
      panel.classList.add('global-error');

      const errEl = document.createElement('div');
      errEl.className = 'global-error-card';

      const title = document.createElement('div');
      title.className = 'global-error-title';
      title.textContent = errorMessage(code, opts.locale);
      errEl.appendChild(title);

      const sub = describeErrorDetail(code, detail, opts.locale);
      if (sub) {
        const subEl = document.createElement('div');
        subEl.className = 'global-error-sub';
        subEl.textContent = sub;
        errEl.appendChild(subEl);
      }

      const ctaInfo = decideCTA(code, opts);
      if (ctaInfo) {
        const cta = document.createElement('button');
        cta.type = 'button';
        cta.className = 'global-error-cta';
        cta.textContent = ctaInfo.label;
        cta.addEventListener('click', ctaInfo.onClick);
        errEl.appendChild(cta);
      }

      panel.appendChild(errEl);
      // 重新定位（panel 高度变了）
      positionPanel(panel, opts.target);
    },
    close,
  };
}

function decideCTA(code: string, opts: OpenOptions): { label: string; onClick: () => void } | null {
  // 配额超限 / 鉴权失败：引导登录（如果有 loginUrl）
  if ((code === 'quota_exceeded' || code === 'unauthorized') && opts.loginUrl) {
    return {
      label: opts.locale === 'zh-CN' ? '登录解锁更多 →' : 'Sign in for more →',
      onClick: () => {
        if (opts.loginUrl) window.open(opts.loginUrl, '_blank');
      },
    };
  }
  return null;
}

function describeErrorDetail(
  code: string,
  detail: Record<string, unknown> | undefined,
  locale: Locale,
): string | null {
  if (!detail) return null;
  if (code === 'quota_exceeded') {
    const used = typeof detail.used === 'number' ? detail.used : null;
    const limit = typeof detail.limit === 'number' ? detail.limit : null;
    if (used != null && limit != null) {
      return locale === 'zh-CN'
        ? `已用 ${used} / ${limit}，下个月初重置。`
        : `Used ${used} / ${limit}. Resets at the start of next month.`;
    }
  }
  if (code === 'rate_limit') {
    const ms = typeof detail.retryAfterMs === 'number' ? detail.retryAfterMs : null;
    if (ms != null) {
      const sec = Math.max(1, Math.ceil(ms / 1000));
      return locale === 'zh-CN' ? `请 ${sec} 秒后重试。` : `Try again in ${sec}s.`;
    }
  }
  return null;
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
