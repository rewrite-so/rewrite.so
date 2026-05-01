/**
 * 流式剥离 reasoning 模型（DeepSeek-R1 / minimax-m25 / Qwen-thinking 等）
 * 输出的 `<think>...</think>` 包裹的思考链。
 *
 * 协议契约（CLAUDE.md 已记录）：上游严格 OpenAI Chat Completions，
 * 但若上游模型在 content 字段里夹带思考标签，我们必须丢弃以兑现产品契约
 * （"输出 ONLY 改写文本，无前言/思考"）。这是最小通用兼容层，仅吃
 * `<think>...</think>` 一种格式。
 *
 * 处理跨 chunk 边界：维护 pending 缓冲，标签可能被切成两半到达。
 */

const OPEN = '<think>';
const CLOSE = '</think>';

export interface ThinkingStripper {
  /** 喂入一个 chunk，返回应该发出去的内容（可能为空） */
  push(chunk: string): string;
  /** 流结束时调用，返回剩余 pending 内容（如果不在 thinking 中） */
  flush(): string;
}

export function createThinkingStripper(): ThinkingStripper {
  let pending = '';
  let thinking = false;

  return {
    push(chunk) {
      pending += chunk;
      let out = '';

      while (true) {
        if (thinking) {
          const closeIdx = pending.indexOf(CLOSE);
          if (closeIdx === -1) {
            // 还在思考中，但保留 pending 末尾可能跨越 CLOSE 标签的 7 字符
            const safeUpto = pending.length - (CLOSE.length - 1);
            if (safeUpto > 0) pending = pending.slice(safeUpto);
            return out;
          }
          // 跳过整段思考块
          pending = pending.slice(closeIdx + CLOSE.length);
          thinking = false;
        } else {
          const openIdx = pending.indexOf(OPEN);
          if (openIdx === -1) {
            // 没看到 <think>，但保留末尾可能跨越 OPEN 标签的 6 字符
            const safeUpto = pending.length - (OPEN.length - 1);
            if (safeUpto > 0) {
              out += pending.slice(0, safeUpto);
              pending = pending.slice(safeUpto);
            }
            return out;
          }
          // 输出 <think> 前的正常内容
          out += pending.slice(0, openIdx);
          pending = pending.slice(openIdx + OPEN.length);
          thinking = true;
        }
      }
    },

    flush() {
      if (thinking) {
        // 流结束时仍在 thinking，丢弃所有 pending（异常情况，模型未关闭标签）
        pending = '';
        return '';
      }
      const tail = pending;
      pending = '';
      return tail;
    },
  };
}

/**
 * 包装一个 content delta 异步迭代器，在中间剥离 <think>...</think>。
 * 同时去除答案前置的纯空白（避免 reasoning 后跟着 \n\n 流出）。
 */
export async function* stripThinking(source: AsyncIterable<string>): AsyncIterable<string> {
  const stripper = createThinkingStripper();
  let leadingWhitespace = true;

  for await (const chunk of source) {
    const out = stripper.push(chunk);
    if (!out) continue;

    if (leadingWhitespace) {
      const trimmed = out.replace(/^\s+/, '');
      if (!trimmed) continue;
      leadingWhitespace = false;
      yield trimmed;
    } else {
      yield out;
    }
  }
  const tail = stripper.flush();
  if (tail) {
    if (leadingWhitespace) {
      const trimmed = tail.replace(/^\s+/, '');
      if (trimmed) yield trimmed;
    } else {
      yield tail;
    }
  }
}
