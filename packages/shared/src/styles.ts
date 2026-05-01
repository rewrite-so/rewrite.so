export type Style = 'faithful' | 'casual' | 'formal';

export const ALL_STYLES: readonly Style[] = ['faithful', 'casual', 'formal'] as const;

export const STYLE_LABEL: Record<Style, { 'zh-CN': string; en: string }> = {
  faithful: { 'zh-CN': '贴近原文', en: 'Faithful' },
  casual: { 'zh-CN': '口语', en: 'Casual' },
  formal: { 'zh-CN': '正式', en: 'Formal' },
};

export function isStyle(value: unknown): value is Style {
  return typeof value === 'string' && (ALL_STYLES as readonly string[]).includes(value);
}
