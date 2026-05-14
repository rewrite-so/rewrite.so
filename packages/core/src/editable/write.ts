import { getEditableKind } from './detect.ts';
import { isDraftEditor, requestDraftReplace } from './draft.ts';

export type WriteRange = 'selection' | 'all';

/**
 * 安全替换输入框内容（保持框架受控状态 + undo 栈尽可能保留）。
 *
 * 分级策略：
 * 1. <input>/<textarea>: 全部 → prototype setter（必须，React 受控才感知）；选区 → setRangeText。
 *    dispatch input/change 都带 composed: true，跨 shadow DOM boundary 通知外层
 *    React state / Web Component 同步（如 Reddit `<faceplate-textarea-input>`）。
 * 2. contenteditable:
 *    a. **Draft.js**（X / Twitter / 老 Medium 等）：DOM 特征匹配后走专用适配器
 *       走 React fiber → props.onChange(newEditorState) 路径。Draft 不接受
 *       dispatchEvent 合成事件——见 draft.ts 头注释的详细解释（W3C 规范 +
 *       Draft 源码引用）。失败时静默 return，**不**走通用路径（避免写坏 DOM）。
 *    b. 其他 contenteditable（Lexical/ProseMirror/Slate/普通 contenteditable）：
 *       总是走完 `beforeinput → 重置 selection → execCommand → input` 完整链路。
 *       **不**根据 beforeinput preventDefault 返回值 silent return —— 浏览器对
 *       合成 InputEvent 不执行默认行为，"框架接管"假设不成立。controlled-tree
 *       框架需要看到 input 事件才能 reconcile model state。execCommand 失败时
 *       DOM Range 兜底用 selectNodeContents(el) 重建全范围，避免 sel.getRangeAt(0)
 *       被框架 handler 漂移到 collapsed selection 后留下旧内容残留。
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
    dispatchInputChange(el);
    return;
  }
  // selection
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (end > start) {
    el.setRangeText(newText, start, end, 'end');
    dispatchInputChange(el);
    return;
  }
  // 没有选区也按全替换
  setNativeValue(el, newText);
  dispatchInputChange(el);
}

/**
 * input + change 事件 dispatch。`composed: true` 让事件跨 shadow DOM boundary
 * —— shadow DOM 内的 textarea（如 Reddit `<faceplate-textarea-input>` 内部）
 * 写值后，外层 light DOM 的 React state 监听 / Web Component 状态同步靠
 * `composed: true` 才能收到事件。
 */
function dispatchInputChange(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
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
  // 1. focus 保证操作目标正确（onSelect 已 focus 但保险幂等）。
  //    shadow DOM 内的 contenteditable 不在本次范围（read.ts:43 用 window.getSelection
  //    在 shadow contenteditable 下行为不一致），所以这里仍可用 document.activeElement。
  if (document.activeElement !== el) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* legacy */
    }
  }

  // 2a. Draft.js 专用适配器：X (Twitter) / 老 Medium / 部分 Reddit 编辑器走
  //     CustomEvent → main-world script → React fiber → props.onChange 路径。
  //     Chrome MV3 content script 跑在 isolated world 看不到 React fiber expando，
  //     必须经由 manifest 中 world: 'MAIN' 的 main-world.ts 间接执行（详见
  //     draft.ts 头注释 + apps/extension/src/content/main-world.ts）。
  //     fire-and-forget：dispatch 后立即 return 不阻塞 UI；main-world 处理是
  //     sync 的，下一帧 Draft re-render 完成。range='selection' 暂时也走全替换。
  //     失败时（main-world 未装/fiber 找不到/反射失败）静默不写 DOM —— UX 是
  //     "什么都没发生" 而不是 "残留+删不掉"。
  if (isDraftEditor(el)) {
    void requestDraftReplace(el, newText);
    return;
  }

  const selectAll = () => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  };

  // 2. 建立目标 selection（全替换 → selectNodeContents；选区 → 保留有效 selection）
  if (range === 'all') {
    selectAll();
  } else {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed) selectAll();
  }

  // 3. 通知框架。不依据返回值决定后续 —— 浏览器对合成 InputEvent 不会执行
  //    默认行为，"框架接管后浏览器仍写入"的假设不成立，我们必须始终自己写。
  try {
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertReplacementText',
        data: newText,
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
  } catch {
    /* 老浏览器不支持 InputEvent constructor */
  }

  // 4. beforeinput handler 可能把 selection 折叠 / 移走（即使没 preventDefault），
  //    全替换模式重置一次再写，避免 execCommand 在 collapsed selection 上变成
  //    "插入到光标处" → 残留旧内容。
  if (range === 'all') selectAll();

  // 5. 写入：execCommand 优先（保留 undo 栈 + 触发原生 input 事件链）
  let written = false;
  if (typeof document.execCommand === 'function') {
    try {
      written = document.execCommand('insertText', false, newText);
    } catch {
      /* ignore */
    }
  }

  // 6. 兜底：DOM Range 重做 —— 用 selectNodeContents(el) 重新建立全 contenteditable
  //    范围而不是可能漂移的 sel.getRangeAt(0)，保证旧内容被完整删除。
  if (!written) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.deleteContents();
    const node = document.createTextNode(newText);
    r.insertNode(node);
    const s = window.getSelection();
    const after = document.createRange();
    after.setStartAfter(node);
    after.collapse(true);
    s?.removeAllRanges();
    s?.addRange(after);
  }

  // 7. 无条件 dispatch input —— 让 Draft.js / Lexical / ProseMirror 等
  //    controlled-tree 框架的 model 同步路径（监听 input 做 DOM diff → reconcile
  //    EditorState）有机会跑。framework preventDefault 一级路径下原代码会 silent
  //    return，导致 model 状态永不更新，用户后续 Backspace 与 model 解耦表现为
  //    "删不掉 / 删了又恢复"。composed: true 跨 shadow boundary 通知外层监听。
  el.dispatchEvent(
    new InputEvent('input', {
      inputType: 'insertReplacementText',
      data: newText,
      bubbles: true,
      composed: true,
    }),
  );
}
