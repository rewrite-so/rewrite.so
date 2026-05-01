/**
 * 双击 Shift 检测器。
 *
 * 关键边界（不可静默更改，每条都对应一个测试用例）：
 * - 500ms 窗口（产品决策，不要随意调）
 * - e.repeat 必须忽略（OS 长按 Shift 会持续 keydown）
 * - 必须先松开再按下（firstUpSeen 标志）— 防大写锁定模式被误触
 * - 修饰键组合（Ctrl/Alt/Meta）+ Shift 不触发
 * - 任何非 Shift keydown 重置状态（Shift→A→Shift 不算双击）
 * - composition 期间（中文输入法切大小写）不触发
 * - 不区分左右 Shift（e.location 不检查）
 *
 * 监听 capture 阶段，避免被网页 stopPropagation。
 */

export interface DoubleShiftOptions {
  /** 两次 Shift down 的最大间隔。默认 500ms。 */
  windowMs?: number;
  /** 触发回调。返回 false 可阻止后续动作（暂未使用）。 */
  onTrigger: (event: KeyboardEvent) => void;
}

export interface DoubleShiftHandle {
  detach: () => void;
}

const DEFAULT_WINDOW_MS = 500;

export function attachDoubleShift(
  target: Window | Document,
  opts: DoubleShiftOptions,
): DoubleShiftHandle {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;

  let pendingFirst = false;
  let firstUpSeen = false;
  let lastDownAt = 0;
  let isComposing = false;

  const reset = () => {
    pendingFirst = false;
    firstUpSeen = false;
  };

  const onKeyDown = (ev: Event) => {
    const e = ev as KeyboardEvent;

    // composition 期间任何按键都重置（避免输入法切换被误判）
    if (isComposing || e.isComposing) {
      reset();
      return;
    }

    if (e.key !== 'Shift') {
      // 任何非 Shift keydown 都重置（Shift → A → Shift 不算双击）
      reset();
      return;
    }

    // 长按 Shift 不重复触发
    if (e.repeat) return;

    // Shift + 任意修饰键不触发
    if (e.ctrlKey || e.altKey || e.metaKey) {
      reset();
      return;
    }

    const now = performance.now();

    if (pendingFirst && firstUpSeen && now - lastDownAt <= windowMs) {
      reset();
      opts.onTrigger(e);
      return;
    }

    pendingFirst = true;
    firstUpSeen = false;
    lastDownAt = now;
  };

  const onKeyUp = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (e.key !== 'Shift') return;
    if (pendingFirst) firstUpSeen = true;
  };

  const onCompositionStart = () => {
    isComposing = true;
    reset();
  };
  const onCompositionEnd = () => {
    isComposing = false;
    reset();
  };

  const opts3 = { capture: true } as const;
  target.addEventListener('keydown', onKeyDown, opts3);
  target.addEventListener('keyup', onKeyUp, opts3);
  target.addEventListener('compositionstart', onCompositionStart, opts3);
  target.addEventListener('compositionend', onCompositionEnd, opts3);

  return {
    detach() {
      target.removeEventListener('keydown', onKeyDown, opts3);
      target.removeEventListener('keyup', onKeyUp, opts3);
      target.removeEventListener('compositionstart', onCompositionStart, opts3);
      target.removeEventListener('compositionend', onCompositionEnd, opts3);
    },
  };
}
