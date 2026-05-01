import { getEditableKind } from './detect.ts';

export interface ReadResult {
  /** 实际要交给 rewrite 的文本 */
  text: string;
  /** 是否仅是选区（选区有内容时为 true） */
  hasSelection: boolean;
  /** 选区周围的简短上下文（最多 200 字符前后），可选 */
  context?: string;
}

const CONTEXT_RADIUS = 200;

/**
 * 读取输入框当前要改写的文本。
 * - 有选区：返回选区文本 + 周围上下文
 * - 无选区：返回全部文本
 */
export function readEditable(el: HTMLElement): ReadResult {
  const kind = getEditableKind(el);

  if (kind === 'input' || kind === 'textarea') {
    const ele = el as HTMLInputElement | HTMLTextAreaElement;
    const value = ele.value ?? '';
    const start = ele.selectionStart ?? 0;
    const end = ele.selectionEnd ?? 0;

    if (end > start) {
      const text = value.slice(start, end);
      const before = value.slice(Math.max(0, start - CONTEXT_RADIUS), start);
      const after = value.slice(end, Math.min(value.length, end + CONTEXT_RADIUS));
      const context = (before + after).trim();
      return {
        text,
        hasSelection: true,
        ...(context ? { context } : {}),
      };
    }
    return { text: value, hasSelection: false };
  }

  if (kind === 'contenteditable') {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // 仅当选区位于该 el 内部
      if (el.contains(range.commonAncestorContainer)) {
        const selText = sel.toString();
        if (selText) {
          // 上下文：el 全文减选区
          const fullText = (el.textContent ?? '').trim();
          // 简化：直接给完整文本作为上下文（最多 2x CONTEXT_RADIUS）
          const context =
            fullText.length > selText.length ? fullText.slice(0, CONTEXT_RADIUS * 2) : '';
          return {
            text: selText,
            hasSelection: true,
            ...(context ? { context } : {}),
          };
        }
      }
    }
    return { text: el.textContent ?? '', hasSelection: false };
  }

  return { text: '', hasSelection: false };
}
