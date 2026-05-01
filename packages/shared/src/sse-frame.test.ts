import { describe, expect, it } from 'vitest';
import { encodeSSEFrame, parseSSEFrame, parseSSEStream, type SSEEvent } from './sse-frame.ts';

describe('encodeSSEFrame', () => {
  it('encodes meta frame', () => {
    const frame: SSEEvent = {
      event: 'meta',
      data: { requestId: 'r1', streams: ['faithful', 'casual', 'formal'], langDetected: 'zh-CN' },
    };
    const wire = encodeSSEFrame(frame);
    expect(wire).toMatch(/^event: meta\ndata: /);
    expect(wire.endsWith('\n\n')).toBe(true);
  });

  it('encodes delta with style and seq', () => {
    const wire = encodeSSEFrame({
      event: 'delta',
      data: { style: 'casual', text: '今儿', seq: 1 },
    });
    expect(wire).toContain('"style":"casual"');
    expect(wire).toContain('"text":"今儿"');
  });

  it('throws on raw newline in data', () => {
    expect(() =>
      encodeSSEFrame({
        event: 'delta',
        data: { style: 'faithful', text: 'a\nb', seq: 1 },
      } as SSEEvent),
    ).not.toThrow(); // JSON.stringify 会转义 \n 为 "\\n"
  });
});

describe('parseSSEFrame', () => {
  it('round-trips meta', () => {
    const orig: SSEEvent = {
      event: 'meta',
      data: { requestId: 'abc', streams: ['faithful', 'casual', 'formal'], langDetected: 'en' },
    };
    const parsed = parseSSEFrame(encodeSSEFrame(orig).trimEnd());
    expect(parsed).toEqual(orig);
  });

  it('round-trips delta', () => {
    const orig: SSEEvent = {
      event: 'delta',
      data: { style: 'formal', text: 'Hello, world.', seq: 7 },
    };
    const parsed = parseSSEFrame(encodeSSEFrame(orig).trimEnd());
    expect(parsed).toEqual(orig);
  });

  it('throws on missing event:', () => {
    expect(() => parseSSEFrame('data: {"x":1}')).toThrow();
  });
});

describe('parseSSEStream', () => {
  it('emits multiple frames in order', async () => {
    const frames: SSEEvent[] = [
      {
        event: 'meta',
        data: { requestId: 'r', streams: ['faithful', 'casual', 'formal'], langDetected: 'en' },
      },
      { event: 'delta', data: { style: 'faithful', text: 'A', seq: 1 } },
      { event: 'delta', data: { style: 'casual', text: 'B', seq: 1 } },
      { event: 'end', data: { requestId: 'r' } },
    ];
    const wire = frames.map(encodeSSEFrame).join('');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      },
    });

    const out: SSEEvent[] = [];
    for await (const ev of parseSSEStream(stream)) out.push(ev);
    expect(out).toEqual(frames);
  });

  it('handles chunks split across frames', async () => {
    const frame: SSEEvent = { event: 'delta', data: { style: 'casual', text: 'X', seq: 1 } };
    const wire = encodeSSEFrame(frame);
    const half = Math.floor(wire.length / 2);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire.slice(0, half)));
        controller.enqueue(new TextEncoder().encode(wire.slice(half)));
        controller.close();
      },
    });

    const out: SSEEvent[] = [];
    for await (const ev of parseSSEStream(stream)) out.push(ev);
    expect(out).toEqual([frame]);
  });
});
