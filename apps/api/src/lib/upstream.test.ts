import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamCompletion, UpstreamError } from './upstream.ts';

function mockSSEResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streamCompletion — happy path', () => {
  it('extracts content deltas from OpenAI SSE format', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockSSEResponse(sse));

    const out: string[] = [];
    for await (const c of streamCompletion(
      { baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'gpt' },
      [{ role: 'user', content: 'hi' }],
      new AbortController().signal,
    )) {
      out.push(c);
    }
    expect(out).toEqual(['Hello', ' world']);
  });

  it('handles chunk split across SSE boundaries', async () => {
    const sse = ['data: {"choices":[{"delta":{"content":"A'];
    const cont = ['BC"}}]}\n\n', 'data: [DONE]\n\n'];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockSSEResponse([...sse, ...cont]));

    const out: string[] = [];
    for await (const c of streamCompletion(
      { baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'gpt' },
      [{ role: 'user', content: 'hi' }],
      new AbortController().signal,
    )) {
      out.push(c);
    }
    expect(out.join('')).toBe('ABC');
  });

  it('strips trailing slash from baseUrl', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockSSEResponse(['data: [DONE]\n\n']));
    const iter = streamCompletion(
      { baseUrl: 'https://api.test/v1/', apiKey: 'k', model: 'gpt' },
      [{ role: 'user', content: 'hi' }],
      new AbortController().signal,
    );
    // consume to trigger fetch
    for await (const _ of iter) void _;

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test/v1/chat/completions',
      expect.any(Object),
    );
  });

  it('sends correct request body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockSSEResponse(['data: [DONE]\n\n']));
    const iter = streamCompletion(
      { baseUrl: 'https://api.test/v1', apiKey: 'sk-123', model: 'gpt-4o-mini' },
      [
        { role: 'system', content: 's' },
        { role: 'user', content: 'u' },
      ],
      new AbortController().signal,
    );
    for await (const _ of iter) void _;

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer sk-123',
      'content-type': 'application/json',
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [
        { role: 'system', content: 's' },
        { role: 'user', content: 'u' },
      ],
    });
  });
});

describe('streamCompletion — error paths', () => {
  it('throws UpstreamError on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 429 }));
    const iter = streamCompletion(
      { baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'gpt' },
      [{ role: 'user', content: 'hi' }],
      new AbortController().signal,
    );
    await expect(async () => {
      for await (const _ of iter) void _;
    }).rejects.toThrow(UpstreamError);
  });

  it('propagates AbortSignal as UpstreamError(aborted)', async () => {
    const ac = new AbortController();
    // 让 fetch 永久 pending；abort 后应触发
    vi.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
      return new Promise((_, reject) => {
        (init as RequestInit).signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    });

    const promise = (async () => {
      for await (const _ of streamCompletion(
        { baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'gpt' },
        [{ role: 'user', content: 'hi' }],
        ac.signal,
      ))
        void _;
    })();

    setTimeout(() => ac.abort(), 10);
    await expect(promise).rejects.toMatchObject({ name: 'UpstreamError', code: 'aborted' });
  });

  it('throws UpstreamError(timeout) when upstream does not respond before timeoutMs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
      return new Promise((_, reject) => {
        (init as RequestInit).signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    });

    vi.useFakeTimers();
    const promise = (async () => {
      for await (const _ of streamCompletion(
        { baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'gpt', timeoutMs: 50 },
        [{ role: 'user', content: 'hi' }],
        new AbortController().signal,
      ))
        void _;
    })();

    const assertion = expect(promise).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
    vi.useRealTimers();
  });

  it('skips frames with non-string content (role-only frame)', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"X"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockSSEResponse(sse));
    const out: string[] = [];
    for await (const c of streamCompletion(
      { baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'gpt' },
      [{ role: 'user', content: 'hi' }],
      new AbortController().signal,
    )) {
      out.push(c);
    }
    expect(out).toEqual(['X']);
  });
});
