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
 * 时跳哪儿"统一回退到这个值。Chrome Web Store 上架后改这一处即可，无需找全 6+ 处 hardcode。
 */
export const DEFAULT_EXTENSION_INSTALL_URL =
  'https://github.com/rewrite-so/rewrite.so/releases/latest';
