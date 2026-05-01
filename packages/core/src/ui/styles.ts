/**
 * 浮层样式（CSS 字符串）。通过 constructable stylesheet 注入到 ShadowRoot，
 * 不会被宿主页 CSS 污染，也不会污染宿主页。
 *
 * 颜色用 light-dark() 适配宿主页主题（Chrome 123+ 支持）。
 */
export const SHADOW_STYLES = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  color-scheme: light dark;
}

.dot {
  position: fixed;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: light-dark(rgba(0, 0, 0, 0.32), rgba(255, 255, 255, 0.4));
  pointer-events: auto;
  cursor: help;
  z-index: 2147483646;
  transition: opacity 120ms ease;
  opacity: 0;
}
.dot.visible { opacity: 1; }
.dot:hover { opacity: 1; transform: scale(1.5); }

.dot-tooltip {
  position: fixed;
  padding: 4px 8px;
  border-radius: 6px;
  background: light-dark(#1f1f1f, #f5f5f5);
  color: light-dark(#fff, #1f1f1f);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2147483647;
  opacity: 0;
  transition: opacity 120ms ease;
}
.dot-tooltip.visible { opacity: 1; }

.panel {
  position: fixed;
  min-width: 320px;
  max-width: 560px;
  background: light-dark(#fff, #1c1c1e);
  color: light-dark(#1f1f1f, #f5f5f5);
  border: 1px solid light-dark(rgba(0,0,0,0.08), rgba(255,255,255,0.1));
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  padding: 6px;
  z-index: 2147483647;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card {
  display: flex;
  align-items: stretch;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 80ms ease;
}
.card:hover, .card.focused {
  background: light-dark(rgba(0,0,0,0.04), rgba(255,255,255,0.06));
}
.card.error {
  opacity: 0.6;
}

.kbd {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.08));
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.label {
  font-size: 11px;
  color: light-dark(rgba(0,0,0,0.5), rgba(255,255,255,0.5));
  letter-spacing: 0.02em;
}

.text {
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.text.dim { color: light-dark(rgba(0,0,0,0.4), rgba(255,255,255,0.4)); }

.skeleton {
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.06)) 25%,
    light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.12)) 50%,
    light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.06)) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
.skeleton.short { width: 60%; }
.skeleton.medium { width: 85%; }

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.footer {
  padding: 6px 12px 4px;
  font-size: 11px;
  color: light-dark(rgba(0,0,0,0.4), rgba(255,255,255,0.4));
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.footer a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
`;
