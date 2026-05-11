// 按 Unicode code point 切片,防止未来文案加 emoji 时被切到 surrogate pair 中间;
// Math.ceil 保证 progress>0 时至少出 1 字符,模拟 SSE first-token 体感。
export function sliceForStream(text: string, progress: number): string {
  if (progress >= 1) return text;
  if (progress <= 0) return '';
  const chars = Array.from(text);
  const n = Math.min(chars.length, Math.ceil(chars.length * progress));
  return chars.slice(0, n).join('');
}
