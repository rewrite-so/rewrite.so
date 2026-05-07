import { parseSSEStream, type SSEEvent } from '@rewrite/shared';
import { describe, expect, it, vi } from 'vitest';
import { muxToSSE } from './sse.ts';

async function* gen(values: string[]): AsyncIterable<string> {
  for (const v of values) yield v;
}

async function* throwingGen(before: string[], err: Error): AsyncIterable<string> {
  for (const v of before) yield v;
  throw err;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
  const out: SSEEvent[] = [];
  for await (const ev of parseSSEStream(stream)) out.push(ev);
  return out;
}

describe('muxToSSE — happy path', () => {
  it('emits meta first, then deltas, then 3 done, then end', async () => {
    const stream = muxToSSE(
      {
        requestId: 'r1',
        langDetected: 'en',
        streams: [
          { style: 'faithful', iter: gen(['Hello', ' world']) },
          { style: 'casual', iter: gen(['Hey']) },
          { style: 'formal', iter: gen(['Hello, ', 'world.']) },
        ],
      },
      new AbortController().signal,
    );

    const events = await collect(stream);
    expect(events[0]).toEqual({
      event: 'meta',
      data: { requestId: 'r1', streams: ['faithful', 'casual', 'formal'], langDetected: 'en' },
    });
    expect(events.at(-1)).toEqual({ event: 'end', data: { requestId: 'r1' } });

    const dones = events.filter((e) => e.event === 'done');
    expect(dones).toHaveLength(3);

    const faithfulDone = dones.find((e) => e.event === 'done' && e.data.style === 'faithful');
    expect(faithfulDone?.data).toMatchObject({ style: 'faithful', finalText: 'Hello world' });

    const casualDone = dones.find((e) => e.event === 'done' && e.data.style === 'casual');
    expect(casualDone?.data).toMatchObject({ style: 'casual', finalText: 'Hey' });
  });

  it('every delta carries its style label', async () => {
    const stream = muxToSSE(
      {
        requestId: 'r1',
        langDetected: 'en',
        streams: [
          { style: 'faithful', iter: gen(['A']) },
          { style: 'casual', iter: gen(['B']) },
          { style: 'formal', iter: gen(['C']) },
        ],
      },
      new AbortController().signal,
    );
    const events = await collect(stream);
    const deltas = events.filter((e) => e.event === 'delta');
    for (const d of deltas) {
      if (d.event !== 'delta') continue;
      expect(['faithful', 'casual', 'formal']).toContain(d.data.style);
    }
  });

  it('skips empty text deltas (no spurious frames)', async () => {
    const stream = muxToSSE(
      {
        requestId: 'r1',
        langDetected: 'en',
        streams: [
          { style: 'faithful', iter: gen(['', 'A', '', 'B']) },
          { style: 'casual', iter: gen(['']) },
          { style: 'formal', iter: gen(['']) },
        ],
      },
      new AbortController().signal,
    );
    const events = await collect(stream);
    const deltas = events.filter((e) => e.event === 'delta');
    expect(deltas).toHaveLength(2);
  });
});

describe('muxToSSE — error tolerance', () => {
  it('one stream error does not block others', async () => {
    const err = new Error('boom');
    const stream = muxToSSE(
      {
        requestId: 'r1',
        langDetected: 'en',
        streams: [
          { style: 'faithful', iter: gen(['ok']) },
          { style: 'casual', iter: throwingGen([], err) },
          { style: 'formal', iter: gen(['ok2']) },
        ],
      },
      new AbortController().signal,
    );
    const events = await collect(stream);

    const errors = events.filter((e) => e.event === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.event === 'error' && errors[0].data.style).toBe('casual');

    const dones = events.filter((e) => e.event === 'done');
    expect(dones).toHaveLength(2);
  });
});

describe('muxToSSE — abort', () => {
  it('client abort closes the stream', async () => {
    const ac = new AbortController();
    const stream = muxToSSE(
      {
        requestId: 'r1',
        langDetected: 'en',
        streams: [
          { style: 'faithful', iter: slowGen(['A', 'B', 'C']) },
          { style: 'casual', iter: slowGen(['X']) },
          { style: 'formal', iter: slowGen(['Y']) },
        ],
      },
      ac.signal,
    );

    setTimeout(() => ac.abort(), 5);

    const events = await collect(stream);
    // 至少应有 meta；其它依赖时序，但 end 不应在 abort 后写出
    expect(events[0]?.event).toBe('meta');
  });
});

async function* slowGen(values: string[]): AsyncIterable<string> {
  for (const v of values) {
    await new Promise((r) => setTimeout(r, 10));
    yield v;
  }
}

describe('muxToSSE — lifecycle hooks', () => {
  it('fires onFirstByte exactly once on first non-empty delta across all streams', async () => {
    const onFirstByte = vi.fn();
    const stream = muxToSSE(
      {
        requestId: 'r1',
        langDetected: 'en',
        streams: [
          { style: 'faithful', iter: gen(['', 'A', 'B']) },
          { style: 'casual', iter: gen(['X', 'Y']) },
          { style: 'formal', iter: gen(['Z']) },
        ],
        lifecycle: { onFirstByte },
      },
      new AbortController().signal,
    );
    await collect(stream);
    expect(onFirstByte).toHaveBeenCalledTimes(1);
  });

  it('does not fire onFirstByte if all streams produce only empty deltas', async () => {
    const onFirstByte = vi.fn();
    const stream = muxToSSE(
      {
        requestId: 'r1',
        langDetected: 'en',
        streams: [
          { style: 'faithful', iter: gen(['']) },
          { style: 'casual', iter: gen(['']) },
          { style: 'formal', iter: gen(['']) },
        ],
        lifecycle: { onFirstByte },
      },
      new AbortController().signal,
    );
    await collect(stream);
    expect(onFirstByte).not.toHaveBeenCalled();
  });

  it('fires onComplete after end frame (happy path)', async () => {
    const onComplete = vi.fn();
    const onAbort = vi.fn();
    const stream = muxToSSE(
      {
        requestId: 'r1',
        langDetected: 'en',
        streams: [{ style: 'faithful', iter: gen(['A']) }],
        lifecycle: { onComplete, onAbort },
      },
      new AbortController().signal,
    );
    await collect(stream);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onAbort).not.toHaveBeenCalled();
  });

  it('fires onAbort and not onComplete when aborted', async () => {
    const onComplete = vi.fn();
    const onAbort = vi.fn();
    const ac = new AbortController();
    const stream = muxToSSE(
      {
        requestId: 'r1',
        langDetected: 'en',
        streams: [
          { style: 'faithful', iter: slowGen(['A', 'B', 'C']) },
          { style: 'casual', iter: slowGen(['X']) },
        ],
        lifecycle: { onComplete, onAbort },
      },
      ac.signal,
    );
    setTimeout(() => ac.abort(), 5);
    await collect(stream);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('fires onStreamError per failing stream', async () => {
    const onStreamError = vi.fn();
    const stream = muxToSSE(
      {
        requestId: 'r1',
        langDetected: 'en',
        streams: [
          { style: 'faithful', iter: gen(['ok']) },
          { style: 'casual', iter: throwingGen([], new Error('boom1')) },
          { style: 'formal', iter: throwingGen([], new Error('boom2')) },
        ],
        lifecycle: { onStreamError },
      },
      new AbortController().signal,
    );
    await collect(stream);
    expect(onStreamError).toHaveBeenCalledTimes(2);
    // each call passes a stable error code
    expect(onStreamError.mock.calls.every((c) => typeof c[0] === 'string')).toBe(true);
  });

  it('a throwing lifecycle hook does not break the stream', async () => {
    const events = await collect(
      muxToSSE(
        {
          requestId: 'r1',
          langDetected: 'en',
          streams: [{ style: 'faithful', iter: gen(['A']) }],
          lifecycle: {
            onFirstByte: () => {
              throw new Error('hook failure');
            },
          },
        },
        new AbortController().signal,
      ),
    );
    // end frame should still arrive
    expect(events.at(-1)?.event).toBe('end');
  });
});
