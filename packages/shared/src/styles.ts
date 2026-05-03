import type { Locale } from './i18n.ts';

export type Style = 'faithful' | 'casual' | 'formal';

export const ALL_STYLES: readonly Style[] = ['faithful', 'casual', 'formal'] as const;

export const STYLE_LABEL: Record<Style, Record<Locale, string>> = {
  faithful: {
    en: 'Faithful',
    'zh-CN': '贴近原文',
    ja: '忠実',
    ko: '충실',
    es: 'Fiel',
    fr: 'Fidèle',
    de: 'Treu',
  },
  casual: {
    en: 'Casual',
    'zh-CN': '口语',
    ja: 'カジュアル',
    ko: '캐주얼',
    es: 'Coloquial',
    fr: 'Décontracté',
    de: 'Locker',
  },
  formal: {
    en: 'Formal',
    'zh-CN': '正式',
    ja: 'フォーマル',
    ko: '격식체',
    es: 'Formal',
    fr: 'Formel',
    de: 'Formell',
  },
};

export function isStyle(value: unknown): value is Style {
  return typeof value === 'string' && (ALL_STYLES as readonly string[]).includes(value);
}
