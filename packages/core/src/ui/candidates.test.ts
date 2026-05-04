/// <reference lib="dom" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCandidates, isRetryableError } from './candidates.ts';
import { createShadowRoot, destroyShadowRoot } from './shadow.ts';

afterEach(() => {
  destroyShadowRoot();
  document.body.innerHTML = '';
});

function setup() {
  const { root } = createShadowRoot('open');
  const onSelect = vi.fn();
  const onCancel = vi.fn();
  const onInstallClick = vi.fn();
  const onRegenerate = vi.fn();
  const onOpenSettings = vi.fn();
  const onRetryAll = vi.fn();
  const factory = createCandidates(root, {
    onSelect,
    onCancel,
    onInstallClick,
    onRegenerate,
    onOpenSettings,
    onRetryAll,
  });
  const target = document.createElement('textarea');
  document.body.appendChild(target);
  return {
    root,
    target,
    factory,
    onSelect,
    onCancel,
    onInstallClick,
    onRegenerate,
    onOpenSettings,
    onRetryAll,
  };
}

describe('createCandidates', () => {
  it('renders 3 cards in fixed order on open', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'zh-CN', targetLang: 'en' });
    const cards = root.querySelectorAll('.card');
    expect(cards.length).toBe(3);
    expect((cards[0] as HTMLElement).dataset.style).toBe('faithful');
    expect((cards[1] as HTMLElement).dataset.style).toBe('casual');
    expect((cards[2] as HTMLElement).dataset.style).toBe('formal');
  });

  it('initial state shows skeletons (no text yet)', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'zh-CN', targetLang: 'en' });
    const skeletons = root.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('appendDelta builds text incrementally', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'zh-CN', targetLang: 'en' });
    handle.appendDelta('faithful', '今天');
    handle.appendDelta('faithful', '天气');
    const card = root.querySelector('.card[data-style="faithful"] .text');
    expect(card?.textContent).toBe('今天天气');
  });

  it('setDone replaces with final text', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'zh-CN', targetLang: 'en' });
    handle.setDone('casual', '今儿天气不错');
    const card = root.querySelector('.card[data-style="casual"] .text');
    expect(card?.textContent).toBe('今儿天气不错');
  });

  it('setError marks card as error and shows message', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'zh-CN', targetLang: 'en' });
    handle.setError('formal', 'upstream_timeout');
    const card = root.querySelector('.card[data-style="formal"]');
    expect(card?.classList.contains('error')).toBe(true);
    expect(card?.querySelector('.text')?.textContent).toContain('上游');
  });

  it('digit key 1 triggers onSelect for faithful', () => {
    const { factory, target, onSelect } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setDone('faithful', 'Hello.');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(onSelect).toHaveBeenCalledWith('faithful', 'Hello.');
  });

  it('digit key 2 triggers onSelect for casual', () => {
    const { factory, target, onSelect } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.appendDelta('casual', 'Hey there');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    expect(onSelect).toHaveBeenCalledWith('casual', 'Hey there');
  });

  it('digit key on pending (no text yet) does nothing', () => {
    const { factory, target, onSelect } = setup();
    factory.open({ target, locale: 'en', targetLang: 'en' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ArrowDown + Enter selects the focused card', () => {
    const { factory, target, onSelect, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setDone('faithful', 'Hello.');
    handle.setDone('casual', 'Hey there.');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(root.querySelector('.card[data-style="casual"]')?.classList.contains('focused')).toBe(
      true,
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onSelect).toHaveBeenCalledWith('casual', 'Hey there.');
  });

  it('Escape triggers onCancel', () => {
    const { factory, target, onCancel } = setup();
    factory.open({ target, locale: 'en', targetLang: 'en' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('close removes panel + listeners', () => {
    const { factory, target, root, onCancel } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.close();
    expect(root.querySelector('.panel')).toBeNull();
    // 关闭后键盘事件不应再触发 callback
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('showInstallHook adds CTA in footer', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'zh-CN', targetLang: 'en', showInstallHook: true });
    const footer = root.querySelector('.footer');
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain('安装扩展');
  });

  it('can disable host-page hint storage for extension mode', () => {
    const { root } = createShadowRoot('open');
    const factory = createCandidates(
      root,
      {
        onSelect: vi.fn(),
        onCancel: vi.fn(),
      },
      { hintStorage: null },
    );
    const target = document.createElement('textarea');
    document.body.appendChild(target);
    factory.open({ target, locale: 'en', targetLang: 'en' });
    expect(root.querySelector('.shortcut-hint')).toBeNull();
  });

  it('install link click triggers onInstallClick', () => {
    const { factory, target, root, onInstallClick } = setup();
    factory.open({ target, locale: 'en', targetLang: 'en', showInstallHook: true });
    const link = root.querySelector('.footer a') as HTMLAnchorElement;
    link.click();
    expect(onInstallClick).toHaveBeenCalledTimes(1);
  });

  // ===== regenerate / retry =====

  it('action button is hidden in pending state', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'en', targetLang: 'en' });
    const action = root.querySelector(
      '.card[data-style="faithful"] .card-action',
    ) as HTMLButtonElement;
    expect(action).not.toBeNull();
    expect(action.style.display).toBe('none');
  });

  it('action button shows spinner during streaming', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.appendDelta('casual', 'Hey');
    const action = root.querySelector(
      '.card[data-style="casual"] .card-action',
    ) as HTMLButtonElement;
    expect(action.classList.contains('card-action-streaming')).toBe(true);
    expect(action.getAttribute('aria-disabled')).toBe('true');
  });

  it('action button shows ↻ regen when card is done; click invokes onRegenerate', () => {
    const { factory, target, root, onRegenerate } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setDone('faithful', 'Hello.');
    const action = root.querySelector(
      '.card[data-style="faithful"] .card-action',
    ) as HTMLButtonElement;
    expect(action.classList.contains('card-action-regen')).toBe(true);
    expect(action.textContent).toBe('↻');
    expect(action.getAttribute('aria-disabled')).toBe('false');
    action.click();
    expect(onRegenerate).toHaveBeenCalledWith('faithful');
  });

  it('error card shows Retry button; click invokes onRegenerate', () => {
    const { factory, target, root, onRegenerate } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setError('formal', 'upstream_timeout');
    const action = root.querySelector(
      '.card[data-style="formal"] .card-action',
    ) as HTMLButtonElement;
    expect(action.classList.contains('card-action-retry')).toBe(true);
    expect(action.textContent?.toLowerCase()).toBe('retry');
    action.click();
    expect(onRegenerate).toHaveBeenCalledWith('formal');
  });

  it('clicking action button does NOT trigger onSelect', () => {
    const { factory, target, root, onSelect, onRegenerate } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setDone('casual', 'Hey there');
    const action = root.querySelector(
      '.card[data-style="casual"] .card-action',
    ) as HTMLButtonElement;
    action.click();
    expect(onRegenerate).toHaveBeenCalledWith('casual');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('resetCard puts done card into regenerating state (preserves old text)', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setDone('formal', 'Greetings.');
    expect(root.querySelector('.card[data-style="formal"] .text')?.textContent).toBe('Greetings.');

    handle.resetCard('formal');
    const card = root.querySelector('.card[data-style="formal"]') as HTMLElement;
    expect(card.classList.contains('error')).toBe(false);
    expect(card.classList.contains('regenerating')).toBe(true);
    // 旧文本保留（视觉连贯：不立即"啪"地消失）
    expect(card.querySelector('.text')?.textContent).toBe('Greetings.');
    // action button 显示 spinner
    const action = card.querySelector('.card-action') as HTMLButtonElement;
    expect(action.classList.contains('card-action-streaming')).toBe(true);
  });

  it('resetCard on error card removes .error, adds .regenerating', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setError('faithful', 'upstream_timeout');
    const card = root.querySelector('.card[data-style="faithful"]') as HTMLElement;
    expect(card.classList.contains('error')).toBe(true);

    handle.resetCard('faithful');
    expect(card.classList.contains('error')).toBe(false);
    expect(card.classList.contains('regenerating')).toBe(true);
    const action = card.querySelector('.card-action') as HTMLButtonElement;
    expect(action.classList.contains('card-action-retry')).toBe(false);
    expect(action.classList.contains('card-action-streaming')).toBe(true);
  });

  it('first appendDelta after resetCard clears old text + removes .regenerating', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setDone('casual', 'Hey there.');
    handle.resetCard('casual');
    expect(root.querySelector('.card[data-style="casual"] .text')?.textContent).toBe('Hey there.');

    handle.appendDelta('casual', 'Hi');
    const card = root.querySelector('.card[data-style="casual"]') as HTMLElement;
    expect(card.classList.contains('regenerating')).toBe(false);
    expect(card.querySelector('.text')?.textContent).toBe('Hi');
  });

  // ===== target chip + settings =====

  it('target chip shows uppercase BCP-47 short code', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'en', targetLang: 'en' });
    const chip = root.querySelector('.target-chip');
    expect(chip?.textContent).toBe('EN');
  });

  it('target chip shows custom natural-language target verbatim (with truncation)', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'en', targetLang: 'Portuguese (Brazilian)' });
    const chip = root.querySelector('.target-chip') as HTMLElement;
    expect(chip.textContent).toBe('Portuguese …'); // first 11 chars + ellipsis
    expect(chip.title).toBe('Portuguese (Brazilian)'); // hover 看完整
  });

  it('target chip shows "auto" lowercase when target is auto', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'en', targetLang: 'auto' });
    const chip = root.querySelector('.target-chip');
    expect(chip?.textContent).toBe('auto');
  });

  it('setLangDetected updates chip text after server meta event', () => {
    const { factory, target, root } = setup();
    // 初始 'auto'（客户端预测） → 服务端 meta 解析为具体语言
    const handle = factory.open({ target, locale: 'en', targetLang: 'auto' });
    const chip = root.querySelector('.target-chip');
    expect(chip?.textContent).toBe('auto');
    handle.setLangDetected('ja');
    expect(chip?.textContent).toBe('JA');
  });

  it('setLangDetected with long custom value sets title attribute', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setLangDetected('Portuguese (Brazilian)');
    const chip = root.querySelector('.target-chip') as HTMLElement;
    expect(chip.textContent).toBe('Portuguese …'); // 11 chars + …
    expect(chip.title).toBe('Portuguese (Brazilian)');
  });

  it('setLangDetected with short code removes stale title', () => {
    const { factory, target, root } = setup();
    // 初始长 custom（带 title） → 服务端覆盖成短码 → title 应被清除
    const handle = factory.open({
      target,
      locale: 'en',
      targetLang: 'Portuguese (Brazilian)',
    });
    const chip = root.querySelector('.target-chip') as HTMLElement;
    expect(chip.title).toBe('Portuguese (Brazilian)');
    handle.setLangDetected('en');
    expect(chip.textContent).toBe('EN');
    expect(chip.hasAttribute('title')).toBe(false);
  });

  it('setLangDetected after close is noop', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.close();
    // close 后调用不应抛错
    expect(() => handle.setLangDetected('ja')).not.toThrow();
    // panel 已被移除，没有 chip 可断言；只验证函数 silent
    expect(root.querySelector('.target-chip')).toBeNull();
  });

  it('setLangDetected ignores empty / undefined target', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    const chip = root.querySelector('.target-chip');
    expect(chip?.textContent).toBe('EN');
    handle.setLangDetected('');
    // 空字符串不更新 chip
    expect(chip?.textContent).toBe('EN');
  });

  it('settings button click invokes onOpenSettings', () => {
    const { factory, target, root, onOpenSettings } = setup();
    factory.open({ target, locale: 'en', targetLang: 'en' });
    const btn = root.querySelector('.settings-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('settings button is omitted when onOpenSettings callback not provided', () => {
    const { root: shadowRoot } = createShadowRoot('open');
    // 不传 onOpenSettings
    const factory = createCandidates(shadowRoot, {
      onSelect: vi.fn(),
      onCancel: vi.fn(),
    });
    const target = document.createElement('textarea');
    document.body.appendChild(target);
    factory.open({ target, locale: 'en', targetLang: 'en' });
    expect(shadowRoot.querySelector('.settings-btn')).toBeNull();
  });

  // ===== setGlobalError Retry =====

  it('setGlobalError shows Retry button for retryable errors (upstream_error)', () => {
    const { factory, target, root, onRetryAll } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setGlobalError('upstream_error');
    const btn = root.querySelector('.global-error-cta') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Retry');
    btn.click();
    expect(onRetryAll).toHaveBeenCalledTimes(1);
  });

  it('setGlobalError shows Retry for upstream_timeout / rate_limit / network', () => {
    for (const code of ['upstream_timeout', 'rate_limit', 'internal_error']) {
      const { factory, target, root } = setup();
      const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
      handle.setGlobalError(code);
      const btn = root.querySelector('.global-error-cta') as HTMLButtonElement;
      expect(btn?.textContent).toBe('Retry');
    }
  });

  it('setGlobalError does NOT show Retry for non-retryable errors (quota_exceeded)', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en', loginUrl: '/login' });
    handle.setGlobalError('quota_exceeded');
    const buttons = root.querySelectorAll('.global-error-cta');
    expect(buttons.length).toBe(1); // 只有 "Sign in for more" CTA
    expect(buttons[0]?.textContent).toContain('Sign in');
  });

  it('setGlobalError shows BOTH Retry + Sign-in for unauthorized when loginUrl present', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en', loginUrl: '/login' });
    handle.setGlobalError('unauthorized');
    const buttons = root.querySelectorAll('.global-error-cta');
    // unauthorized 不可重试 —— 只有 Sign-in CTA
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.textContent).toContain('Sign in');
  });

  // ===== setStatus: BYOK badge / quota chip / signin hint =====

  it('setStatus shows BYOK badge when isBYOK=true', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    expect((root.querySelector('.byok-badge') as HTMLElement).style.display).toBe('none');
    handle.setStatus({ authed: true, tier: 'pro', isBYOK: true });
    expect((root.querySelector('.byok-badge') as HTMLElement).style.display).toBe('');
    expect(root.querySelector('.byok-badge')?.textContent).toBe('BYOK');
  });

  it('setStatus shows quota chip with .warn class at >=80% (amber)', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setStatus({ authed: true, tier: 'free', isBYOK: false, used: 25, limit: 30 });
    const chip = root.querySelector('.quota-chip') as HTMLElement;
    expect(chip.style.display).toBe('');
    expect(chip.textContent).toBe('25/30');
    expect(chip.classList.contains('warn')).toBe(true);
  });

  it('setStatus shows quota chip without .warn class at >=50% but <80% (gray)', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setStatus({ authed: true, tier: 'free', isBYOK: false, used: 18, limit: 30 });
    const chip = root.querySelector('.quota-chip') as HTMLElement;
    expect(chip.style.display).toBe('');
    expect(chip.textContent).toBe('18/30');
    expect(chip.classList.contains('warn')).toBe(false);
  });

  it('setStatus hides quota chip below 50% threshold', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setStatus({ authed: true, tier: 'free', isBYOK: false, used: 10, limit: 30 });
    expect((root.querySelector('.quota-chip') as HTMLElement).style.display).toBe('none');
  });

  it('setStatus hides quota chip in BYOK mode regardless of usage', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    // BYOK 时即使有 used/limit 也不显示 quota chip
    handle.setStatus({ authed: true, tier: 'pro', isBYOK: true, used: 9999, limit: 10000 });
    expect((root.querySelector('.quota-chip') as HTMLElement).style.display).toBe('none');
  });

  it('setStatus shows signin hint footer when authed=false and no install hook', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({
      target,
      locale: 'en',
      targetLang: 'en',
      loginUrl: '/login',
    });
    expect(root.querySelector('.signin-hint')).toBeNull();
    handle.setStatus({
      authed: false,
      tier: 'anonymous_ip',
      isBYOK: false,
      used: 1,
      limit: 10,
    });
    const hint = root.querySelector('.signin-hint') as HTMLElement;
    expect(hint).not.toBeNull();
    // 文案应使用 QUOTA.loggedInFree=30（引导值，不用当前匿名 limit）
    expect(hint.textContent).toContain('30');
  });

  it('setStatus does NOT show signin hint when showInstallHook=true', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({
      target,
      locale: 'en',
      targetLang: 'en',
      showInstallHook: true,
      loginUrl: '/login',
    });
    handle.setStatus({
      authed: false,
      tier: 'anonymous_ip',
      isBYOK: false,
      used: 1,
      limit: 10,
    });
    // install hook 优先（web 模式），signin hint 不重复出现
    expect(root.querySelector('.signin-hint')).toBeNull();
  });

  it('setStatus does NOT show signin hint when authed=true', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({
      target,
      locale: 'en',
      targetLang: 'en',
      loginUrl: '/login',
    });
    handle.setStatus({ authed: true, tier: 'free', isBYOK: false, used: 5, limit: 30 });
    expect(root.querySelector('.signin-hint')).toBeNull();
  });

  // ===== decideCTA: 按 detail.authed 路由超配额 CTA =====

  it('quota_exceeded with detail.authed=true and upgradeUrl shows "Upgrade to Pro" CTA', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({
      target,
      locale: 'en',
      targetLang: 'en',
      loginUrl: '/login',
      upgradeUrl: '/billing',
    });
    handle.setGlobalError('quota_exceeded', { authed: true, used: 30, limit: 30 });
    const buttons = root.querySelectorAll('.global-error-cta');
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.textContent).toContain('Upgrade');
  });

  it('quota_exceeded with detail.authed=false shows "Sign in for more" CTA', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({
      target,
      locale: 'en',
      targetLang: 'en',
      loginUrl: '/login',
      upgradeUrl: '/settings',
    });
    handle.setGlobalError('quota_exceeded', { authed: false, used: 10, limit: 10 });
    const buttons = root.querySelectorAll('.global-error-cta');
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.textContent).toContain('Sign in for more');
  });

  it('setStatus after setGlobalError is a noop (panel already wiped)', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en', loginUrl: '/login' });
    handle.setGlobalError('quota_exceeded', { authed: false, used: 10, limit: 10 });
    // 此时 byokBadge / quotaChip / signinHintEl 都已 detach（panel.innerHTML 被清空）
    expect(root.querySelector('.byok-badge')).toBeNull();
    expect(root.querySelector('.signin-hint')).toBeNull();

    // setStatus 不应抛错也不应在 detached 节点上 mutate，更不应往 panel 重新插 footer
    expect(() =>
      handle.setStatus({ authed: false, tier: 'anonymous_ip', isBYOK: false, used: 1, limit: 10 }),
    ).not.toThrow();
    expect(root.querySelector('.signin-hint')).toBeNull();
    expect(root.querySelector('.byok-badge')).toBeNull();
  });

  it('unauthorized always shows "Sign in" CTA when loginUrl present', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en', targetLang: 'en', loginUrl: '/login' });
    handle.setGlobalError('unauthorized');
    const btn = root.querySelector('.global-error-cta') as HTMLButtonElement;
    expect(btn?.textContent).toContain('Sign in');
  });

  // ===== isRetryableError export（mount.ts regen 升级路径用） =====

  it('isRetryableError classifies transient errors as retryable', () => {
    expect(isRetryableError('upstream_error')).toBe(true);
    expect(isRetryableError('upstream_timeout')).toBe(true);
    expect(isRetryableError('rate_limit')).toBe(true);
    expect(isRetryableError('internal_error')).toBe(true);
    expect(isRetryableError('network')).toBe(true);
  });

  it('isRetryableError classifies user/quota errors as non-retryable', () => {
    // mount.ts 用这些做单卡 regen → setGlobalError 升级判断
    expect(isRetryableError('quota_exceeded')).toBe(false);
    expect(isRetryableError('unauthorized')).toBe(false);
    expect(isRetryableError('invalid_input')).toBe(false);
    expect(isRetryableError('input_too_long')).toBe(false);
    expect(isRetryableError('turnstile_failed')).toBe(false);
  });

  it('setGlobalError without onRetryAll callback shows no button (graceful degrade)', () => {
    const { root: shadowRoot } = createShadowRoot('open');
    const factory = createCandidates(shadowRoot, {
      onSelect: vi.fn(),
      onCancel: vi.fn(),
    });
    const target = document.createElement('textarea');
    document.body.appendChild(target);
    const handle = factory.open({ target, locale: 'en', targetLang: 'en' });
    handle.setGlobalError('upstream_error');
    expect(shadowRoot.querySelector('.global-error-cta')).toBeNull();
  });
});
