export type Locale = 'zh-CN' | 'en';

export type I18nKey =
  | 'hint.doubleShift'
  | 'hint.tryOnAnyInput'
  | 'cta.installExtension'
  | 'state.thinking'
  | 'error.rateLimit'
  | 'error.quotaExceeded'
  | 'error.upstream'
  | 'error.tooLong'
  | 'error.invalidInput'
  | 'error.unauthorized'
  | 'error.network'
  | 'placeholder.tryHere';

const STRINGS: Record<Locale, Record<I18nKey, string>> = {
  'zh-CN': {
    'hint.doubleShift': '按 Shift Shift 即可改写',
    'hint.tryOnAnyInput': '安装扩展，在任何网站都能用',
    'cta.installExtension': '安装扩展 →',
    'state.thinking': '思考中…',
    'error.rateLimit': '请求过快，稍后再试',
    'error.quotaExceeded': '本月配额已用完，请登录或升级',
    'error.upstream': '上游模型出错，请重试',
    'error.tooLong': '输入超过 4000 字符',
    'error.invalidInput': '输入不合法',
    'error.unauthorized': '请登录后再试',
    'error.network': '网络异常',
    'placeholder.tryHere': '在此输入文本，按 Shift Shift 改写',
  },
  en: {
    'hint.doubleShift': 'Press Shift Shift to rewrite',
    'hint.tryOnAnyInput': 'Install the extension to use it on any site',
    'cta.installExtension': 'Install extension →',
    'state.thinking': 'Thinking…',
    'error.rateLimit': 'Too many requests, please slow down',
    'error.quotaExceeded': 'Monthly quota reached. Sign in or upgrade.',
    'error.upstream': 'Upstream model error, please retry',
    'error.tooLong': 'Input exceeds 4000 characters',
    'error.invalidInput': 'Invalid input',
    'error.unauthorized': 'Please sign in first',
    'error.network': 'Network error',
    'placeholder.tryHere': 'Type here, then press Shift Shift to rewrite',
  },
};

/** 从 navigator.language 选 locale。回退 'en'。 */
export function pickLocale(navLang: string | undefined): Locale {
  if (!navLang) return 'en';
  return navLang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function t(key: I18nKey, locale: Locale): string {
  return STRINGS[locale][key] ?? STRINGS.en[key] ?? key;
}
