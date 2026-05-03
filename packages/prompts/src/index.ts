import type { Style } from '@rewrite/shared';
import { buildSystemPrompt } from './system.ts';

export type { Style };
export { buildSystemPrompt };

export interface BuildMessagesOptions {
  style: Style;
  /** BCP-47 目标语言；如 'zh-CN' / 'en' / 'ja' */
  targetLang: string;
  text: string;
  /** 选区周围的上下文（不会被改写，只供消歧）；最大 2KB */
  context?: string;
  /** 是否仅改写选区。MVP 不影响 prompt 主体，仅作为元信息。 */
  hasSelection: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * 构造发给 OpenAI Chat Completions 的 messages 数组。
 *
 * 设计要点：
 * - 三引号包裹 user 文本，降低 prompt injection 风险
 * - context 单独标注，明确告诉模型不要改写它
 * - **hasSelection=true 时**：用 SELECTION/CONTEXT 双区块格式，明确告诉模型
 *   "只输出选中那段的改写，CONTEXT 仅供语气/对象判断不要改进输出"。
 *   解决用户在长文本里选段改写时，LLM 过度参考 context 导致输出脱离选中段落的问题。
 */
export function buildMessages(opts: BuildMessagesOptions): ChatMessage[] {
  const system = buildSystemPrompt(opts.style, opts.targetLang);

  const userParts: string[] = [];
  if (opts.hasSelection && opts.context?.trim()) {
    // 选区改写 + 有上下文：双区块强约束
    userParts.push(
      `Surrounding context (DO NOT rewrite this; only use to judge tone, audience, formality):\n"""${opts.context}"""\n`,
    );
    userParts.push(
      `Selection to rewrite (output ONLY the rewritten selection — no preamble, no surrounding context, just the replacement for this exact text):\n"""${opts.text}"""`,
    );
  } else if (opts.context?.trim()) {
    // 全文改写但带 context（边界情况，read.ts 通常不产生）
    userParts.push(
      `Context (do not rewrite this, only use to disambiguate):\n"""${opts.context}"""\n`,
    );
    userParts.push(`Text to rewrite:\n"""${opts.text}"""`);
  } else {
    // 全文改写，无 context
    userParts.push(`Text to rewrite:\n"""${opts.text}"""`);
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n') },
  ];
}
