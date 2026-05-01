// 单次输入字符上限（成本控制 + UX 平衡）
export const MAX_INPUT_CHARS = 4000;

// 月配额（按 UTC 自然月聚合，非按日）
export const QUOTA = {
  /** 网页匿名访客（IP 维度）每月 */
  anonymousIp: 10,
  /** 扩展未登录用户（installId 维度）每月 */
  anonymousInstall: 5,
  /** 登录免费用户每月 */
  loggedInFree: 30,
  /** Pro 订阅每月（月付 $13.99 / 年付 $8/月）*/
  pro: 2000,
} as const;

export type QuotaTier = keyof typeof QUOTA;

// Pro 价格（USD）
export const PRO_PRICE = {
  monthly: 13.99,
  yearlyMonthly: 8, // 年付折算到月（实际年付 $96）
  yearlyTotal: 96,
} as const;
