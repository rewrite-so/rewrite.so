/// <reference lib="dom" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCandidates } from './candidates.ts';
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
  const factory = createCandidates(root, {
    onSelect,
    onCancel,
    onInstallClick,
    onRegenerate,
  });
  const target = document.createElement('textarea');
  document.body.appendChild(target);
  return { root, target, factory, onSelect, onCancel, onInstallClick, onRegenerate };
}

describe('createCandidates', () => {
  it('renders 3 cards in fixed order on open', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'zh-CN' });
    const cards = root.querySelectorAll('.card');
    expect(cards.length).toBe(3);
    expect((cards[0] as HTMLElement).dataset.style).toBe('faithful');
    expect((cards[1] as HTMLElement).dataset.style).toBe('casual');
    expect((cards[2] as HTMLElement).dataset.style).toBe('formal');
  });

  it('initial state shows skeletons (no text yet)', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'zh-CN' });
    const skeletons = root.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('appendDelta builds text incrementally', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'zh-CN' });
    handle.appendDelta('faithful', '今天');
    handle.appendDelta('faithful', '天气');
    const card = root.querySelector('.card[data-style="faithful"] .text');
    expect(card?.textContent).toBe('今天天气');
  });

  it('setDone replaces with final text', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'zh-CN' });
    handle.setDone('casual', '今儿天气不错');
    const card = root.querySelector('.card[data-style="casual"] .text');
    expect(card?.textContent).toBe('今儿天气不错');
  });

  it('setError marks card as error and shows message', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'zh-CN' });
    handle.setError('formal', 'upstream_timeout');
    const card = root.querySelector('.card[data-style="formal"]');
    expect(card?.classList.contains('error')).toBe(true);
    expect(card?.querySelector('.text')?.textContent).toContain('上游');
  });

  it('digit key 1 triggers onSelect for faithful', () => {
    const { factory, target, onSelect } = setup();
    const handle = factory.open({ target, locale: 'en' });
    handle.setDone('faithful', 'Hello.');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(onSelect).toHaveBeenCalledWith('faithful', 'Hello.');
  });

  it('digit key 2 triggers onSelect for casual', () => {
    const { factory, target, onSelect } = setup();
    const handle = factory.open({ target, locale: 'en' });
    handle.appendDelta('casual', 'Hey there');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    expect(onSelect).toHaveBeenCalledWith('casual', 'Hey there');
  });

  it('digit key on pending (no text yet) does nothing', () => {
    const { factory, target, onSelect } = setup();
    factory.open({ target, locale: 'en' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escape triggers onCancel', () => {
    const { factory, target, onCancel } = setup();
    factory.open({ target, locale: 'en' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('close removes panel + listeners', () => {
    const { factory, target, root, onCancel } = setup();
    const handle = factory.open({ target, locale: 'en' });
    handle.close();
    expect(root.querySelector('.panel')).toBeNull();
    // 关闭后键盘事件不应再触发 callback
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('showInstallHook adds CTA in footer', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'zh-CN', showInstallHook: true });
    const footer = root.querySelector('.footer');
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain('安装扩展');
  });

  it('install link click triggers onInstallClick', () => {
    const { factory, target, root, onInstallClick } = setup();
    factory.open({ target, locale: 'en', showInstallHook: true });
    const link = root.querySelector('.footer a') as HTMLAnchorElement;
    link.click();
    expect(onInstallClick).toHaveBeenCalledTimes(1);
  });

  // ===== regenerate / retry =====

  it('action button is hidden in pending state', () => {
    const { factory, target, root } = setup();
    factory.open({ target, locale: 'en' });
    const action = root.querySelector(
      '.card[data-style="faithful"] .card-action',
    ) as HTMLButtonElement;
    expect(action).not.toBeNull();
    expect(action.style.display).toBe('none');
  });

  it('action button shows spinner during streaming', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en' });
    handle.appendDelta('casual', 'Hey');
    const action = root.querySelector(
      '.card[data-style="casual"] .card-action',
    ) as HTMLButtonElement;
    expect(action.classList.contains('card-action-streaming')).toBe(true);
    expect(action.getAttribute('aria-disabled')).toBe('true');
  });

  it('action button shows ↻ regen when card is done; click invokes onRegenerate', () => {
    const { factory, target, root, onRegenerate } = setup();
    const handle = factory.open({ target, locale: 'en' });
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
    const handle = factory.open({ target, locale: 'en' });
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
    const handle = factory.open({ target, locale: 'en' });
    handle.setDone('casual', 'Hey there');
    const action = root.querySelector(
      '.card[data-style="casual"] .card-action',
    ) as HTMLButtonElement;
    action.click();
    expect(onRegenerate).toHaveBeenCalledWith('casual');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('resetCard clears done card back to pending skeleton', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en' });
    handle.setDone('formal', 'Greetings.');
    expect(root.querySelector('.card[data-style="formal"] .text')?.textContent).toBe('Greetings.');

    handle.resetCard('formal');
    const card = root.querySelector('.card[data-style="formal"]') as HTMLElement;
    expect(card.classList.contains('error')).toBe(false);
    // skeleton 节点重新出现
    expect(card.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    // action 又隐藏
    const action = card.querySelector('.card-action') as HTMLButtonElement;
    expect(action.style.display).toBe('none');
  });

  it('resetCard on error card removes .error class and Retry button', () => {
    const { factory, target, root } = setup();
    const handle = factory.open({ target, locale: 'en' });
    handle.setError('faithful', 'upstream_timeout');
    expect(root.querySelector('.card[data-style="faithful"]')?.classList.contains('error')).toBe(
      true,
    );

    handle.resetCard('faithful');
    const card = root.querySelector('.card[data-style="faithful"]') as HTMLElement;
    expect(card.classList.contains('error')).toBe(false);
    const action = card.querySelector('.card-action') as HTMLButtonElement;
    expect(action.classList.contains('card-action-retry')).toBe(false);
    expect(action.style.display).toBe('none');
  });
});
