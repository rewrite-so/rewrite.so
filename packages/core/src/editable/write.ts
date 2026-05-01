import { getEditableKind } from './detect.ts';

export type WriteRange = 'selection' | 'all';

/**
 * 安全替换输入框内容（保持框架受控状态 + undo 栈尽可能保留）。
 *
 * 分级策略：
 * 1. <input>/<textarea>: 全部 → prototype setter（必须，React 受控才感知）；选区 → setRangeText
 * 2. contenteditable: dispatch beforeinput(insertReplacementText) → 框架（ProseMirror/Lexical/Slate）接管；
 *    被 preventDefault 的话退化到 execCommand('insertText')；最后 DOM Range 兜底
 */
export function replaceEditable(el: HTMLElement, newText: string, range: WriteRange): void {
  const kind = getEditableKind(el);

  if (kind === 'input' || kind === 'textarea') {
    replaceFormField(el as HTMLInputElement | HTMLTextAreaElement, newText, range);
    return;
  }
  if (kind === 'contenteditable') {
    replaceContentEditable(el, newText, range);
    return;
  }
}

function replaceFormField(
  el: HTMLInputElement | HTMLTextAreaElement,
  newText: string,
  range: WriteRange,
): void {
  if (range === 'all') {
    setNativeValue(el, newText);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  // selection
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (end > start) {
    el.setRangeText(newText, start, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  // 没有选区也按全替换
  setNativeValue(el, newText);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * React 受控 input 关键 hack：必须用 prototype setter 触发 `set` trap，
 * 否则 React 监听的 onChange 不会感知值变化（ReactDOM 拦截 .value 赋值）。
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  const setter = desc?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
}

function replaceContentEditable(el: HTMLElement, newText: string, range: WriteRange): void {
  const sel = window.getSelection();

  // 全替换：先选中全部内容
  if (range === 'all') {
    const r = document.createRange();
    r.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(r);
  } else {
    // 选区模式：保持当前选区（如果选区落在 el 内）
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      // 没有有效选区，退化为全替换
      const r = document.createRange();
      r.selectNodeContents(el);
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  }

  // 1) beforeinput - 现代框架支持的标准方式
  let acceptedByFramework = false;
  try {
    const beforeInput = new InputEvent('beforeinput', {
      inputType: 'insertReplacementText',
      data: newText,
      bubbles: true,
      cancelable: true,
    });
    const notCanceled = el.dispatchEvent(beforeInput);
    // 若框架 preventDefault，notCanceled === false → 框架自己处理了
    acceptedByFramework = !notCanceled;
  } catch {
    // 老浏览器不支持 InputEvent constructor
  }

  if (acceptedByFramework) return;

  // 2) execCommand 退化（已废弃但保留 undo 栈）
  if (typeof document.execCommand === 'function') {
    try {
      const ok = document.execCommand('insertText', false, newText);
      if (ok) return;
    } catch {
      // ignore
    }
  }

  // 3) DOM Range 兜底（破坏 undo）
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    r.deleteContents();
    r.insertNode(document.createTextNode(newText));
    // 折叠到末尾
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  el.dispatchEvent(
    new InputEvent('input', { inputType: 'insertReplacementText', data: newText, bubbles: true }),
  );
}
