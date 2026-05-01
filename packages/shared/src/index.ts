export type Style = 'faithful' | 'casual' | 'formal';

export const ALL_STYLES: readonly Style[] = ['faithful', 'casual', 'formal'] as const;

export const STYLE_LABEL: Record<Style, { 'zh-CN': string; en: string }> = {
  faithful: { 'zh-CN': '贴近原文', en: 'Faithful' },
  casual: { 'zh-CN': '口语', en: 'Casual' },
  formal: { 'zh-CN': '正式', en: 'Formal' },
};

export const MAX_INPUT_CHARS = 4000;

export const QUOTA = {
  anonymousIp: 10,
  anonymousInstall: 5,
  loggedInFree: 30,
  pro: 2000,
} as const;
