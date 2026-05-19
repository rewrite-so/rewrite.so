/**
 * 输入框检测与 PII 硬排除。
 *
 * 这是隐私底线的代码守门员：双击 Shift 触发前必须用 isUsableEditable 校验。
 * PII 输入框（密码 / 信用卡 / OTP / CVV 等）的内容**绝不**能被发到 LLM。
 */

const PII_AUTOCOMPLETE_TOKENS = [
  'cc-', // Credit card 系列
  'current-password',
  'new-password',
  'one-time-code',
];

const PII_NAME_REGEX = /password|passwd|pwd|pin|cvv|cvc|otp|secret|token/i;

/** 是否是基础 editable（不考虑 PII 等排除规则）。 */
export function isEditable(el: Element | null | undefined): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;

  if (el instanceof HTMLInputElement) {
    return INPUT_ACCEPTED_TYPES.has((el.type ?? 'text').toLowerCase());
  }
  if (el instanceof HTMLTextAreaElement) return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute('role') === 'textbox') return true;
  return false;
}

const INPUT_ACCEPTED_TYPES = new Set([
  'text',
  'search',
  'url',
  '', // <input> without type defaults to text
]);

/** 是否应被硬排除（PII / 不可写）。 */
export function isExcluded(el: HTMLElement): boolean {
  // password / hidden 类型 input 直接拒绝
  if (el instanceof HTMLInputElement) {
    const type = (el.type ?? '').toLowerCase();
    if (type === 'password' || type === 'hidden') return true;
  }

  // 不可编辑（disabled / readonly）
  if ('disabled' in el && el.disabled === true) return true;
  if ('readOnly' in el && el.readOnly === true) return true;

  // autocomplete 是空格分隔 token 列表，真实页面常见：
  // "section-checkout billing cc-number"。逐 token 判断，避免敏感 token
  // 被 section-* / billing / shipping 等前缀挡住。
  const autocompleteTokens = (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/);
  for (const token of autocompleteTokens) {
    if (!token) continue;
    for (const piiToken of PII_AUTOCOMPLETE_TOKENS) {
      if (piiToken.endsWith('-') ? token.startsWith(piiToken) : token === piiToken) return true;
    }
  }

  // name / id 含敏感关键字
  const name = el.getAttribute('name') ?? '';
  const id = el.id ?? '';
  if (PII_NAME_REGEX.test(name) || PII_NAME_REGEX.test(id)) return true;

  return false;
}

/** 综合判断：是否可被 rewrite.so 操作。 */
export function isUsableEditable(el: Element | null | undefined): el is HTMLElement {
  return isEditable(el) && !isExcluded(el);
}

export type EditableKind = 'input' | 'textarea' | 'contenteditable';

export function getEditableKind(el: HTMLElement): EditableKind | null {
  if (el instanceof HTMLInputElement) return 'input';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el.isContentEditable || el.getAttribute('role') === 'textbox') return 'contenteditable';
  return null;
}

/**
 * 是否是 Lexical 编辑器（DOM 特征：`data-lexical-editor="true"`）。
 *
 * 跨 shadow boundary 遍历：closest() 不跨越 shadow root，但 Lexical 可能被宿主
 * 应用包在 shadow DOM 内（如 Reddit 未来的 Web Component 化）。手工遍历
 * parentNode + host 链路命中任一层 `data-lexical-editor="true"` 即返 true。
 */
export function isLexicalEditor(el: Element | null | undefined): boolean {
  if (!el) return false;
  let cur: Node | null = el;
  while (cur) {
    if (cur instanceof Element && cur.getAttribute?.('data-lexical-editor') === 'true') {
      return true;
    }
    // ShadowRoot.host 跳出 shadow boundary；普通节点走 parentNode
    const host: Element | null = (cur as unknown as { host?: Element | null }).host ?? null;
    const parent: Node | null = cur.parentNode ?? host;
    if (parent === cur) break;
    cur = parent;
  }
  return false;
}

export type ControlledEditorEngine = 'lexical' | 'draft' | 'prosemirror' | 'slate';

/**
 * 检测受控编辑器引擎。返回引擎名或 null（普通 contenteditable / 非编辑器）。
 *
 * 用于 write.ts 调度：受控编辑器优先走 main-world 合成 paste 主路径，普通
 * contenteditable 走通用 DOM 路径（避免无 paste handler 的 contenteditable 上
 * 浪费 ~50ms 等探针失败）。
 *
 * 检测顺序：Lexical (cross-shadow) → Draft (DOM class) → ProseMirror (DOM class)
 * → Slate (data-attribute)。优先级按用户已覆盖站点估算（Reddit / X / Notion / Discord）。
 */
export function detectControlledEditor(
  el: Element | null | undefined,
): ControlledEditorEngine | null {
  if (!el || !(el instanceof Element)) return null;
  if (isLexicalEditor(el)) return 'lexical';
  // Draft.js: `.public-DraftEditor-content` 是内层 contenteditable；`.DraftEditor-root` 是外层 wrapper
  if (el.classList.contains('public-DraftEditor-content') || el.closest('.DraftEditor-root')) {
    return 'draft';
  }
  // ProseMirror: 内层 contenteditable 自带 `.ProseMirror` class
  if (el.classList.contains('ProseMirror') || el.closest('.ProseMirror')) {
    return 'prosemirror';
  }
  // Slate: `<div data-slate-editor="true" contenteditable>`
  if (el.closest('[data-slate-editor="true"]')) return 'slate';
  return null;
}
