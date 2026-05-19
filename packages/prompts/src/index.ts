import type { Style } from '@rewrite/shared';
import { buildSystemPrompt, resolveRuleset } from './system.ts';

export type { Style };
export { buildSystemPrompt, resolveRuleset };

export interface BuildMessagesOptions {
  style: Style;
  /** BCP-47 目标语言；如 'zh-CN' / 'en' / 'ja'。也允许自然语言描述（"粤语"、
   *  "British English"），见 sanitize-target-lang.ts + resolveRuleset。 */
  targetLang: string;
  text: string;
  /** 选区周围的上下文（不会被改写，只供消歧）；最大 2KB */
  context?: string;
  /** 是否仅改写选区。影响 user prompt 区块结构。 */
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
 * - **hasSelection=true 时**：无条件输出 "Selection to rewrite" 标签，让 LLM
 *   明确知道只需替换这一段。有 context 时再额外加 "Surrounding context"
 *   双区块；没 context 时只发 Selection 标签（兜底，防止 read.ts 没采到周边
 *   时 LLM 误把整段重写）。
 */
export function buildMessages(opts: BuildMessagesOptions): ChatMessage[] {
  const system = buildSystemPrompt(opts.style, opts.targetLang);

  const userParts: string[] = [];
  if (opts.hasSelection) {
    if (opts.context?.trim()) {
      // 选区改写 + 有上下文：双区块强约束
      userParts.push(
        `Surrounding context (DO NOT rewrite this; only use to judge tone, audience, formality):\n"""${opts.context}"""\n`,
      );
      userParts.push(
        `Selection to rewrite (output ONLY the rewritten selection — no preamble, no surrounding context, just the replacement for this exact text):\n"""${opts.text}"""`,
      );
    } else {
      // 选区改写 + 无 context：兜底仍发 Selection 标签
      userParts.push(
        `Selection to rewrite (output ONLY the rewritten selection — no preamble, no surrounding context, just the replacement for this exact text):\n"""${opts.text}"""`,
      );
    }
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
