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
