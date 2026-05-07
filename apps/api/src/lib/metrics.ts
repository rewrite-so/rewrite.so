/**
 * Cloudflare Analytics Engine writer for /v1/rewrite.
 *
 * Privacy contract（继承 CLAUDE.md「隐私与安全」段）：
 * - 仅写中性维度（tier / style / target_lang sanitized / latency / error code）
 * - 严禁写 prompt、output、原始 IP、邮箱、user id 明文
 * - user_id_hash 算法固定为 SHA-256("user_id_v1:" + raw) 截前 16 hex 字符；
 *   admin 仓库使用同一公式做关联（见 docs/admin-rollout-plan.md）
 *
 * 字段映射到 Analytics Engine（25 blob slots / 25 double slots）：
 *   indexes: tier
 *   blob1=style_csv, blob2=target_lang, blob3=status, blob4=error_code,
 *   blob5=upstream, blob6=input_length_bucket, blob7=user_id_hash,
 *   blob8=target_lang_is_custom('1'|'0')
 *   double1=ms_to_first_byte, double2=ms_total, double3=style_count,
 *   double4=input_length
 */
import { sanitizeTargetLang } from './sanitize-target-lang.ts';

export type RewriteTier = 'anonymous_ip' | 'anonymous_install' | 'free' | 'pro' | 'byok';
export type RewriteStatus =
  | 'ok'
  | 'aborted'
  | 'upstream_error'
  | 'quota_exceeded'
  | 'banned'
  | 'invalid';
export type RewriteUpstream = 'platform' | 'byok';
export type InputLengthBucket = '<100' | '<500' | '<1000' | '<2000' | '<4000';

export interface RequestMetric {
  tier: RewriteTier;
  /**
   * 本次请求选了哪些 style（CSV，按 buildMessages 顺序）。
   * 运行时由 zod RewriteRequestSchema 限定为 'faithful' | 'casual' | 'formal'，
   * 但 zod infer 出 string，因此类型层放宽到 string 简化调用方传参。
   */
  styles: readonly string[];
  /**
   * 客户端原始 lang（标准 locale 如 'en' / 'zh-CN' / 'auto'，或自定义短语
   * 如 'Shakespearean'）。writeRequestEvent 内部会跑 sanitizeTargetLang 并
   * 截断到 30 字符再写入；调用方不需要预先 sanitize。
   */
  targetLang: string;
  /**
   * 是否非 7 个标准 locale 之一。'auto' 也算 custom（运营视角：非标准选项）。
   */
  targetLangIsCustom: boolean;
  /** 原始输入字符数（用于落入 bucket，不写明文） */
  inputLength: number;
  upstream: RewriteUpstream;
  status: RewriteStatus;
  errorCode?: string;
  msToFirstByte?: number;
  msTotal?: number;
  /**
   * subject 的稳定标识（已 hash）。
   * **不同 tier 用不同 hash namespace**，跨 tier 不可关联：
   * - 'user' / 'byok' / 'free' / 'pro': SHA-256("user_id_v1:"+user_id) 截 16 hex
   * - 'anonymous_install': SHA-256("user_id_v1:"+install_id) 截 16 hex
   * - 'anonymous_ip': hashIp(ip, daily_salt) 的前 16 hex（不同 namespace）
   * admin 看板做用户级关联时必须先按 tier 分组。
   */
  subjectId?: string;
}

const STANDARD_LOCALES = new Set(['en', 'zh-CN', 'ja', 'ko', 'es', 'fr', 'de']);

const TARGET_LANG_MAX_LEN = 30;

export function bucketInputLength(n: number): InputLengthBucket {
  if (n < 100) return '<100';
  if (n < 500) return '<500';
  if (n < 1000) return '<1000';
  if (n < 2000) return '<2000';
  return '<4000';
}

export function isCustomTargetLang(raw: string): boolean {
  return !STANDARD_LOCALES.has(raw);
}

/**
 * SHA-256("user_id_v1:" + raw) → hex → 前 16 字符。
 * 算法版本固定，admin 仓库复刻同公式。变更需 bump v1 → v2 并接受历史数据失联。
 */
export async function hashUserId(raw: string): Promise<string> {
  const enc = new TextEncoder().encode(`user_id_v1:${raw}`);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    hex += b.toString(16).padStart(2, '0');
  }
  return hex.slice(0, 16);
}

/**
 * 把 RequestMetric 落到 Analytics Engine。
 * 调用方应通过 ctx.waitUntil 包裹，避免阻塞 SSE 主响应。
 *
 * 容错：若 dataset binding 不存在（本地 wrangler dev 可能未配），静默 no-op。
 */
export function writeRequestEvent(
  dataset: AnalyticsEngineDataset | undefined,
  metric: RequestMetric,
): void {
  if (!dataset) return;

  const sanitizedLang = sanitizeTargetLang(metric.targetLang).slice(0, TARGET_LANG_MAX_LEN);
  const stylesCsv = [...metric.styles].sort().join(',');

  // 自我保护：写指标永不让请求失败。AnalyticsEngine.writeDataPoint 在
  // worker isolate 拆解中可能抛错；调用方虽然多半在 ctx.waitUntil 里，
  // 但 metrics 这一层契约就是 fire-and-forget。
  try {
    dataset.writeDataPoint({
      indexes: [metric.tier],
      blobs: [
        stylesCsv,
        sanitizedLang,
        metric.status,
        metric.errorCode ?? '',
        metric.upstream,
        bucketInputLength(metric.inputLength),
        metric.subjectId ?? '',
        metric.targetLangIsCustom ? '1' : '0',
      ],
      doubles: [
        metric.msToFirstByte ?? 0,
        metric.msTotal ?? 0,
        metric.styles.length,
        metric.inputLength,
      ],
    });
  } catch {
    // intentional: any failure here is preferable to disrupting the response
  }
}
