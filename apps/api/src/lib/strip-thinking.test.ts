import { describe, expect, it } from 'vitest';
import { createThinkingStripper, stripThinking } from './strip-thinking.ts';

function feed(stripper: ReturnType<typeof createThinkingStripper>, chunks: string[]): string {
  let out = '';
  for (const c of chunks) out += stripper.push(c);
  out += stripper.flush();
  return out;
}

describe('createThinkingStripper', () => {
  it('passes through content without think tags', () => {
    const s = createThinkingStripper();
    expect(feed(s, ['Hello, ', 'world.'])).toBe('Hello, world.');
  });

  it('strips a complete think block', () => {
    const s = createThinkingStripper();
    expect(feed(s, ['<think>thinking...</think>The answer.'])).toBe('The answer.');
  });

  it('strips think block split across chunks (open tag boundary)', () => {
    const s = createThinkingStripper();
    expect(feed(s, ['<thi', 'nk>thinking...</think>Final.'])).toBe('Final.');
  });

  it('strips think block split across chunks (close tag boundary)', () => {
    const s = createThinkingStripper();
    expect(feed(s, ['<think>thinking...</thi', 'nk>Final.'])).toBe('Final.');
  });

  it('strips multiple think blocks', () => {
    const s = createThinkingStripper();
    expect(feed(s, ['<think>a</think>X<think>b</think>Y'])).toBe('XY');
  });

  it('discards pending if stream ends inside thinking', () => {
    const s = createThinkingStripper();
    expect(feed(s, ['<think>incomplete...'])).toBe('');
  });

  it('preserves content before think tag', () => {
    const s = createThinkingStripper();
    expect(feed(s, ['Hello <think>x</think>world.'])).toBe('Hello world.');
  });

  it('handles single character chunks', () => {
    const s = createThinkingStripper();
    const input = '<think>abc</think>OK';
    let out = '';
    for (const ch of input) out += s.push(ch);
    out += s.flush();
    expect(out).toBe('OK');
  });
});

describe('stripThinking (async iterable)', () => {
  async function* gen(values: string[]): AsyncIterable<string> {
    for (const v of values) yield v;
  }

  async function collect(it: AsyncIterable<string>): Promise<string> {
    let out = '';
    for await (const c of it) out += c;
    return out;
  }

  it('strips think and trims leading whitespace', async () => {
    const out = await collect(stripThinking(gen(['<think>x</think>\n\nHello.'])));
    expect(out).toBe('Hello.');
  });

  it('preserves leading content when no think tag', async () => {
    const out = await collect(stripThinking(gen(['  Hello.'])));
    // 答案前空白被剥
    expect(out).toBe('Hello.');
  });

  it('does not trim mid-content whitespace', async () => {
    const out = await collect(stripThinking(gen(['<think>x</think>Hello,', ' world.'])));
    expect(out).toBe('Hello, world.');
  });
});
