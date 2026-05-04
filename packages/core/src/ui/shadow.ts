import { SHADOW_STYLES } from './styles.ts';

const HOST_TAG = 'rewrite-so-host';

let cachedShadow: {
  host: HTMLElement;
  root: ShadowRoot;
} | null = null;

/**
 * 创建（或获取已存在的）Shadow DOM 容器。
 * 默认 `closed`：阻止宿主页脚本枚举我们的浮层（隐私 + 防广告拦截器误杀）。
 * web 调试时传 'open' 便于检查。
 */
export function createShadowRoot(mode: 'closed' | 'open' = 'closed'): {
  host: HTMLElement;
  root: ShadowRoot;
} {
  let host = document.querySelector(HOST_TAG) as HTMLElement | null;
  if (cachedShadow && cachedShadow.host === host && cachedShadow.host.isConnected) {
    return cachedShadow;
  }

  if (!host) {
    host = document.createElement(HOST_TAG);
    // 用 fixed + 0 定位，避免影响宿主页布局
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
    document.documentElement.appendChild(host);
  }

  // 已存在 shadowRoot 时直接复用（mode 不可变；closed 模式下不通过 host.shadowRoot 暴露）
  const existing = (host as unknown as { shadowRoot?: ShadowRoot }).shadowRoot;
  if (existing) {
    cachedShadow = { host, root: existing };
    return cachedShadow;
  }

  let root: ShadowRoot;
  try {
    root = host.attachShadow({ mode });
  } catch {
    // closed shadowRoot 无法通过 host.shadowRoot 取回；如果模块缓存丢失但宿主还在，
    // 直接 attachShadow 会抛。移除旧 host 后重建，保证 remount 不会卡死。
    host.remove();
    host = document.createElement(HOST_TAG);
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode });
  }

  // 用 constructable stylesheet（性能优于内联 <style>）
  if ('adoptedStyleSheets' in root && typeof CSSStyleSheet !== 'undefined') {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(SHADOW_STYLES);
      root.adoptedStyleSheets = [sheet];
    } catch {
      // 退化到内联 <style>
      injectInlineStyle(root);
    }
  } else {
    injectInlineStyle(root);
  }

  cachedShadow = { host, root };
  return cachedShadow;
}

function injectInlineStyle(root: ShadowRoot): void {
  const style = document.createElement('style');
  style.textContent = SHADOW_STYLES;
  root.appendChild(style);
}

export function destroyShadowRoot(): void {
  const host = document.querySelector(HOST_TAG);
  host?.remove();
  cachedShadow = null;
}
