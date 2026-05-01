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
 * - hasSelection 当前不改变 prompt（设计决策，见 prompts.test.ts）
 */
export function buildMessages(opts: BuildMessagesOptions): ChatMessage[] {
  const system = buildSystemPrompt(opts.style, opts.targetLang);

  const userParts: string[] = [];
  if (opts.context?.trim()) {
    userParts.push(
      `Context (do not rewrite this, only use to disambiguate):\n"""${opts.context}"""\n`,
    );
  }
  userParts.push(`Text to rewrite:\n"""${opts.text}"""`);

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n') },
  ];
}
