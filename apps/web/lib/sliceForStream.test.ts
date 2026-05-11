import { describe, expect, it } from 'vitest';
import { sliceForStream } from './sliceForStream.ts';

describe('sliceForStream', () => {
  it('progress=0 返回空串', () => {
    expect(sliceForStream('hello', 0)).toBe('');
  });

  it('progress=1 返回完整文本', () => {
    expect(sliceForStream('hello', 1)).toBe('hello');
  });

  it('progress=0.5 返回半截 (ceil 向上取整)', () => {
    // ceil(5 * 0.5) = 3
    expect(sliceForStream('hello', 0.5)).toBe('hel');
  });

  it('progress 略大于 0 至少返回 1 字符 (避免空白违和帧)', () => {
    expect(sliceForStream('hello', 0.0001)).toBe('h');
  });

  it('负值 clamp 到空串', () => {
    expect(sliceForStream('hello', -0.5)).toBe('');
  });

  it('超过 1 clamp 到完整文本', () => {
    expect(sliceForStream('hello', 1.5)).toBe('hello');
  });

  it('空串安全返回空串', () => {
    expect(sliceForStream('', 0.5)).toBe('');
    expect(sliceForStream('', 1)).toBe('');
  });

  it('emoji / surrogate pair 不被切到一半', () => {
    // '👋hello': '👋' 是 surrogate pair (UTF-16 长度 2, code point 长度 1),
    // Array.from 切后 chars.length = 6, progress=0.5 → ceil(6*0.5) = 3 字符 → '👋he'。
    // 如果用 String.prototype.slice 直接切 UTF-16 单元会切出半个 surrogate,渲染成 ?。
    expect(sliceForStream('👋hello', 0.5)).toBe('👋he');
  });

  it('多 emoji 文本逐 code point 切片', () => {
    // 'a👋b👋c': Array.from 长度 5
    // progress=0.4 → ceil(5*0.4) = 2 字符 → 'a👋'
    expect(sliceForStream('a👋b👋c', 0.4)).toBe('a👋');
  });

  it('中文 / 日文 BMP 字符按 1 字符计', () => {
    // 这些都是 BMP 范围, .length 和 Array.from(...).length 一致
    expect(sliceForStream('改写演示', 0.5)).toBe('改写');
    expect(sliceForStream('ありがとう', 0.6)).toBe('ありが');
  });
});
