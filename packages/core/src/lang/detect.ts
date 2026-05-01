/**
 * 目标语言检测优先级链：
 *   userPref（!== 'auto'）  →  输入框祖先 lang  →  <html lang>
 *   →  navigator.language  →  Unicode script 启发式（基于输入文本）
 *
 * 启发式仅用于兜底（前面四级都缺失时）。它不区分简繁、不识别更细方言。
 */

export type LangDetectInput = {
  /** 用户偏好；'auto' 触发自动检测；其它 BCP-47 直接返回 */
  userPref: string;
  /** 当前输入框元素（用于祖先 lang 查找） */
  el?: HTMLElement | null;
  /** 当前输入框的文本（启发式兜底用），可截前 200 字 */
  sampleText?: string;
};

export function detectTargetLang(input: LangDetectInput): string {
  if (input.userPref && input.userPref !== 'auto') {
    return normalize(input.userPref);
  }

  // 1) 输入框祖先 lang
  const ancestor = findAncestorLang(input.el);
  if (ancestor) return normalize(ancestor);

  // 2) <html lang>
  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement.getAttribute('lang');
    if (htmlLang) return normalize(htmlLang);
  }

  // 3) navigator.language
  if (typeof navigator !== 'undefined' && navigator.language) {
    return normalize(navigator.language);
  }

  // 4) script 启发式
  if (input.sampleText) return scriptHeuristic(input.sampleText);

  return 'en';
}

function findAncestorLang(el: HTMLElement | null | undefined): string | null {
  let cur: HTMLElement | null = el ?? null;
  while (cur && cur !== document.documentElement) {
    const lang = cur.getAttribute('lang');
    if (lang) return lang;
    cur = cur.parentElement;
  }
  return null;
}

export function scriptHeuristic(text: string): string {
  if (!text) return 'en';
  let han = 0;
  let kana = 0;
  let hangul = 0;
  let arabic = 0;
  let cyrillic = 0;
  let latin = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (cp >= 0x4e00 && cp <= 0x9fff) han++;
    else if (cp >= 0x3040 && cp <= 0x30ff) kana++;
    else if (cp >= 0xac00 && cp <= 0xd7af) hangul++;
    else if (cp >= 0x0600 && cp <= 0x06ff) arabic++;
    else if (cp >= 0x0400 && cp <= 0x04ff) cyrillic++;
    else if (
      (cp >= 0x41 && cp <= 0x5a) || // A-Z
      (cp >= 0x61 && cp <= 0x7a) // a-z
    )
      latin++;
  }

  // 日文判定：必须含假名（仅汉字归中文）
  if (kana > 0) return 'ja';
  if (hangul > 0) return 'ko';
  if (han > 0) return 'zh-CN';
  if (arabic > 0) return 'ar';
  if (cyrillic > 0) return 'ru';
  if (latin > 0) return 'en';
  return 'en';
}

function normalize(tag: string): string {
  return tag.trim().replace(/_/g, '-');
}
