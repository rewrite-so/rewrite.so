// 单次输入字符上限（成本控制 + UX 平衡）
export const MAX_INPUT_CHARS = 4000;

/** 输入长度分桶 —— rewrite metrics 与 /try `try_input` 事件共用同一口径 */
export type InputLengthBucket = '<100' | '<500' | '<1000' | '<2000' | '<4000';

/**
 * 把字符数归入固定 5 桶。隐私设计：埋点只记桶不记明文长度。
 * metrics（`rewrite_requests`）与 events（`try_input`）单源共用,避免两端口径漂移。
 */
export function bucketInputLength(n: number): InputLengthBucket {
  if (n < 100) return '<100';
  if (n < 500) return '<500';
  if (n < 1000) return '<1000';
  if (n < 2000) return '<2000';
  return '<4000';
}

// 月配额（按 UTC 自然月聚合，非按日）
export const QUOTA = {
  /** 网页匿名访客（IP 维度）每月 */
  anonymousIp: 10,
  /** 扩展未登录用户（installId 维度）每月 */
  anonymousInstall: 5,
  /** 登录免费用户每月 */
  loggedInFree: 30,
  /** Pro 订阅每月（月付 $13.99 / 年付 $7.99/月）*/
  pro: 2000,
} as const;

export type QuotaTier = keyof typeof QUOTA;

// Pro 价格（USD）
export const PRO_PRICE = {
  monthly: 13.99,
  /** 年付折算到月（营销文案"$7.99/mo billed annually"用） */
  yearlyMonthly: 7.99,
  /** 年付一次扣的总额 */
  yearlyTotal: 95.88,
  /** 年付相对月付节省百分比，向下取整以保守 */
  yearlySavingsPercent: 43,
} as const;

/**
 * 扩展安装入口 URL 的内置 fallback。
 * 所有 web/api/email 中"用户没在 env 配 EXTENSION_INSTALL_URL / NEXT_PUBLIC_EXTENSION_INSTALL_URL
 * 时跳哪儿"统一回退到这个值。已指向 Chrome Web Store listing；切换 listing
 * 或扩展 ID 时改这一处即可，无需找全 6+ 处 hardcode。
 *
 * 用极简形式（不含 slug），Chrome Web Store 会自动 redirect 到带 slug 的官方 listing。
 */
export const DEFAULT_EXTENSION_INSTALL_URL =
  'https://chromewebstore.google.com/detail/gheiendipgcgiligfmbimbbffkkfiamk';
