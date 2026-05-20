import { z } from 'zod';
import { MAX_INPUT_CHARS } from './quotas.ts';
import { ALL_STYLES } from './styles.ts';

/** POST /v1/rewrite 请求体 */
export const RewriteRequestSchema = z.object({
  text: z
    .string()
    .min(1, 'text cannot be empty')
    .max(MAX_INPUT_CHARS, `text exceeds ${MAX_INPUT_CHARS} chars`),
  context: z.string().max(2000).optional(),
  hasSelection: z.boolean(),
  /** BCP-47 或 'auto' */
  lang: z.string().min(1).max(50),
  // 单卡 regen 时只发该 style；首发 = 3 风格；min(1) 防误传空数组
  styles: z
    .array(z.enum(ALL_STYLES as readonly [string, ...string[]]))
    .min(1)
    .max(3),
  /** true = 单卡 regenerate 重发；首发不带。用于 rewrite metrics 的 regen 率统计 */
  regen: z.boolean().optional(),
  /** 扩展安装 ID（匿名维度） */
  installId: z.string().min(1).max(64).optional(),
  /** 网页体验页 Turnstile token，扩展端不必填 */
  turnstileToken: z.string().max(4096).optional(),
});

export type RewriteRequest = z.infer<typeof RewriteRequestSchema>;

/** /v1/me/usage 响应 */
export interface UsageResponse {
  used: number;
  limit: number;
  remaining: number;
  /** UTC ISO，下个月初重置时间 */
  resetAt: string;
  tier: 'anonymous' | 'free' | 'pro' | 'byok';
}
