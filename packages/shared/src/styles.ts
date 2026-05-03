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

/**
 * 风格副标题 —— 给浮层卡片 label 下方的小字描述。让用户一眼明白 3 风格差别，
 * 不必脑补"贴近原文 vs 口语"到底是什么。
 */
export const STYLE_SUBLABEL: Record<Style, Record<Locale, string>> = {
  faithful: {
    en: 'Keeps your original tone',
    'zh-CN': '保留你原话的语气',
    ja: '元の口調を保つ',
    ko: '원래 어조를 유지',
    es: 'Conserva tu tono original',
    fr: 'Garde votre ton original',
    de: 'Behält deinen ursprünglichen Ton bei',
  },
  casual: {
    en: 'Everyday conversation',
    'zh-CN': '日常对话风',
    ja: '日常会話の感じ',
    ko: '일상 대화 톤',
    es: 'Tono cotidiano',
    fr: 'Ton du quotidien',
    de: 'Alltagston',
  },
  formal: {
    en: 'Polished, business-ready',
    'zh-CN': '商务书面感',
    ja: 'ビジネス向け',
    ko: '비즈니스 격식체',
    es: 'Tono profesional',
    fr: 'Ton professionnel',
    de: 'Geschäftlich, professionell',
  },
};

export function isStyle(value: unknown): value is Style {
  return typeof value === 'string' && (ALL_STYLES as readonly string[]).includes(value);
}
