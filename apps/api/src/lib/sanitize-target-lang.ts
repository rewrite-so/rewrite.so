/**
 * 改写目标语言（targetLang）的 sanitize —— 因为它会被直接注入到 prompt 字符串
 * 字面量 `The target language is "${targetLang}"` 中。
 *
 * 必须 strip：
 *   - 引号 `"` `'` 和反斜杠 `\`：防 prompt 跳出 string literal 污染上下文
 *   - 0x00–0x1F + 0x7F：ASCII 控制字符（含 NUL/BEL/换行等），任何隐蔽注入向量
 *
 * 不 strip：
 *   - 普通空格、括号、连字符、CJK / 阿拉伯 / 西里尔等任意脚本
 *   - 多个空格压成一个，再 trim 首尾
 *
 * 历史数据兜底：v0.1.0 的 SettingsClient 用 hardcoded 8 项下拉，targetLang 永远
 * 是 'auto' 或 BCP-47 短码——历史 DB 中无非法字符。但 GET /v1/me/settings 仍
 * 跑一遍 sanitize 作为防御纵深，以防未来误入脏数据。
 */
export function sanitizeTargetLang(raw: string): string {
  return (
    raw
      // biome-ignore lint/suspicious/noControlCharactersInRegex: 故意 strip ASCII 控制字符防 prompt 注入
      .replace(/[\x00-\x1f\x7f"'\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
