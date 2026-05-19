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
  width: 5px;
  height: 5px;
  border-radius: 1.5px;
  background: #20C7B5;
  border: 0.5px solid light-dark(rgba(255, 255, 255, 0.4), rgba(0, 0, 0, 0.1));
  pointer-events: auto;
  cursor: pointer;
  z-index: 2147483646;
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 160ms ease,
    box-shadow 160ms ease;
  opacity: 0;
  transform: scale(1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
@keyframes rs-dot-breathe {
  0%, 100% { opacity: 0.85; transform: scale(1); }
  50% { opacity: 0.65; transform: scale(0.9); }
}
.dot.visible {
  opacity: 0.85;
  animation: rs-dot-breathe 4s ease-in-out infinite;
}
/* Hover keeps the breathing animation running on top of the scale(2)
 * transform — intentional, so the hovered dot still feels alive.
 * Scoped to .visible so a dot that's been hide()d while the cursor
 * lingers won't re-emerge at scale(2) with no breathing animation
 * running to cap its transform. */
.dot.visible:hover {
  opacity: 1;
  transform: scale(2); /* Scale up to 10px on hover for easier clicking */
  box-shadow:
    0 0 0 1px light-dark(rgba(255, 255, 255, 0.7), rgba(21, 26, 31, 0.5)),
    0 2px 6px rgba(32, 199, 181, 0.25);
}

@media (prefers-reduced-motion: reduce) {
  .dot.visible { animation: none; }
}

.dot-tooltip {
  position: fixed;
  padding: 5px 9px;
  border-radius: 7px;
  background: light-dark(#1f1f1f, #f5f5f5);
  color: light-dark(#fff, #1f1f1f);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2147483647;
  opacity: 0;
  transform: translateY(2px);
  transition: opacity 140ms ease, transform 140ms ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}
.dot-tooltip.visible { opacity: 1; transform: translateY(0); }
.dot-tooltip kbd {
  display: inline-block;
  padding: 0 4px;
  margin: 0 1px;
  border-radius: 3px;
  background: light-dark(rgba(255, 255, 255, 0.15), rgba(0, 0, 0, 0.08));
  font-size: 11px;
  font-family: inherit;
}

.panel {
  position: fixed;
  min-width: 320px;
  max-width: 560px;
  background: light-dark(rgba(255, 255, 255, 0.75), rgba(28, 28, 30, 0.75));
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  color: light-dark(#1f1f1f, #f5f5f5);
  border: 1px solid light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.1));
  border-radius: 16px;
  box-shadow: 
    0 12px 48px rgba(0, 0, 0, 0.12),
    0 0 0 1px light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.05));
  padding: 8px;
  z-index: 2147483647;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 4px 6px 8px;
}

/* brand label：低调显示在 header 最左侧，让用户每次打开浮窗都能看到品牌；
 * margin-right:auto 把其它 chip / 齿轮推到右侧（panel-header 是 flex 容器） */
.brand-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: light-dark(rgba(0,0,0,0.5), rgba(255,255,255,0.5));
  margin-right: auto;
  pointer-events: none;
  user-select: none;
  font-feature-settings: "tnum";
}

.target-chip {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 4px;
  background: light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.08));
  color: light-dark(rgba(0,0,0,0.6), rgba(255,255,255,0.6));
  pointer-events: none;
  font-feature-settings: "tnum";
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* BYOK badge：绿色 chip，BYOK 模式下显示在 header 最左 */
.byok-badge {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 4px;
  background: light-dark(rgba(34,197,94,0.12), rgba(34,197,94,0.18));
  color: light-dark(#15803d, #4ade80);
  pointer-events: none;
}

/* quota chip：used/limit 数字，分两段显示
 *  - .quota-chip 默认（>=50%, <80%）：与 target chip 同款灰色，柔和提示
 *  - .quota-chip.warn（>=80%）：琥珀色，明显警告"快用完" */
.quota-chip {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 2px 8px;
  border-radius: 4px;
  background: light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.08));
  color: light-dark(rgba(0,0,0,0.6), rgba(255,255,255,0.6));
  pointer-events: none;
  font-feature-settings: "tnum";
}
.quota-chip.warn {
  background: light-dark(rgba(245,158,11,0.10), rgba(245,158,11,0.18));
  color: light-dark(#b45309, #fbbf24);
}

.settings-btn {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: light-dark(rgba(0,0,0,0.45), rgba(255,255,255,0.45));
  font-family: inherit;
  padding: 0;
  transition: background 120ms ease, color 120ms ease;
}
.settings-btn:hover {
  background: light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.10));
  color: light-dark(#1f1f22, #f5f5f5);
}

.card {
  display: flex;
  align-items: stretch;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 80ms ease;
  position: relative;
}
.card:hover, .card.focused {
  background: light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.1));
}
.card.error {
  opacity: 0.85;
}
.card.regenerating {
  /* regen 期间整张卡变暗 + 旧文本保留，等首个 delta 来才清空 */
  opacity: 0.45;
  transition: opacity 200ms ease;
}
.card.regenerating .text {
  color: light-dark(rgba(0,0,0,0.4), rgba(255,255,255,0.4));
}
/* setApplying: 用户点了 Apply，等 paste 探针 + fallback 链。被点的卡保留可见状态，
 * 其它卡 pointer-events 禁用避免重复触发 onSelect。整个 panel 内除了被 apply 的卡，
 * 都不可点；同时把"被 apply 的卡"自身的 click 也屏蔽（仍可点 spinner）。 */
.panel.applying .card { pointer-events: none; }
.card.applying { opacity: 0.7; }
/* setWriteFailed: 写入全部失败，候选卡显示错误文案 + Copy 兜底按钮 */
.card.write-failed {
  opacity: 0.9;
  pointer-events: auto;
}
.card.write-failed .text { color: light-dark(#a33, #f88); }
.card-action-copy {
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  background: light-dark(rgba(0,0,0,0.08), rgba(255,255,255,0.16));
  color: inherit;
}
.card-action-copy:hover {
  background: light-dark(rgba(0,0,0,0.14), rgba(255,255,255,0.22));
}

.card-action {
  position: absolute;
  right: 10px;
  bottom: 8px;
  border: none;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.card-action[aria-disabled="true"] { cursor: default; }
.card-action-regen {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1;
  color: light-dark(rgba(0,0,0,0.45), rgba(255,255,255,0.45));
  opacity: 0.7;
  transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
}
.card-action-regen:hover {
  opacity: 1;
  background: light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.10));
  color: light-dark(#1f1f22, #f5f5f5);
}
.card-action-retry {
  height: 22px;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid light-dark(rgba(0,0,0,0.18), rgba(255,255,255,0.22));
  color: light-dark(#1f1f22, #f5f5f5);
  background: transparent;
  transition: background 120ms ease, border-color 120ms ease;
}
.card-action-retry:hover {
  background: light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.10));
  border-color: light-dark(rgba(0,0,0,0.32), rgba(255,255,255,0.32));
}
.card-action-streaming {
  width: 18px;
  height: 18px;
}
.card-action-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid light-dark(rgba(0,0,0,0.18), rgba(255,255,255,0.20));
  border-top-color: light-dark(rgba(0,0,0,0.55), rgba(255,255,255,0.55));
  animation: rs-spin 0.7s linear infinite;
}
@keyframes rs-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .card-action-spinner { animation: none; }
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
  font-weight: 600;
  color: light-dark(rgba(0,0,0,0.55), rgba(255,255,255,0.55));
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.text {
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  /* Reserve space for the absolute-positioned .card-action (regen ↻ /
   * spinner) anchored at right:10 bottom:8 — without this the last line of
   * a long rewrite overlaps the icon. 18px button + 8px breathing room. */
  padding-right: 26px;
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

.shortcut-hint {
  padding: 6px 12px 4px;
  font-size: 11px;
  color: light-dark(rgba(0,0,0,0.42), rgba(255,255,255,0.42));
  text-align: center;
  font-feature-settings: "tnum";
  letter-spacing: 0.01em;
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

.footer-dismiss {
  margin-left: auto;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: light-dark(rgba(0,0,0,0.35), rgba(255,255,255,0.35));
  font-family: inherit;
  padding: 0;
  transition: background 120ms ease, color 120ms ease;
}
.footer-dismiss:hover {
  background: light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.10));
  color: light-dark(#1f1f22, #f5f5f5);
}

/* signin hint：未登录用户底部引导，整行可点击 */
.signin-hint {
  padding: 8px 12px;
  margin-top: 2px;
  font-size: 11px;
  color: light-dark(rgba(0,0,0,0.55), rgba(255,255,255,0.55));
  text-align: center;
  cursor: pointer;
  border-top: 1px solid light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.08));
  transition: background 120ms ease, color 120ms ease;
}
.signin-hint:hover {
  background: light-dark(rgba(0,0,0,0.04), rgba(255,255,255,0.06));
  color: light-dark(#1f1f22, #f5f5f5);
}

.panel.global-error {
  padding: 18px 20px;
}
.global-error-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.global-error-title {
  font-size: 14px;
  font-weight: 600;
  color: light-dark(#1f1f22, #f5f5f5);
}
.global-error-sub {
  font-size: 12px;
  color: light-dark(rgba(0,0,0,0.55), rgba(255,255,255,0.55));
  line-height: 1.5;
}
.global-error-btn-row {
  display: flex;
  flex-direction: row;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.global-error-cta {
  padding: 7px 13px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: light-dark(#fff, #1f1f22);
  background: light-dark(#1f1f22, #f5f5f5);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 120ms ease;
}
.global-error-cta:hover { opacity: 0.85; }
`;
