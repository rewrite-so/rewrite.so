import { describe, expect, it, vi } from 'vitest';
import { performSignOut } from './sign-out.ts';

describe('performSignOut', () => {
  it('200 正常路径：返回 ok，并以 better-auth 要求的形态发请求', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    const result = await performSignOut(fetchMock);
    expect(result).toEqual({ status: 'ok' });

    // 调用形态校验是这次 bug 的核心 — 缺 Content-Type / JSON body 就 415。
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/sign-out');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{}');
  });

  it('415 / 其它 4xx 失败：返回 failed + httpStatus + detail，不抛错', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('Unsupported Media Type', { status: 415 }));

    const result = await performSignOut(fetchMock);
    expect(result).toEqual({
      status: 'failed',
      httpStatus: 415,
      detail: 'Unsupported Media Type',
    });
  });

  it('网络异常：fetch reject 时返回 network_error，原始 error 透传', async () => {
    const networkErr = new TypeError('fetch failed');
    const fetchMock = vi.fn().mockRejectedValue(networkErr);

    const result = await performSignOut(fetchMock);
    expect(result).toEqual({ status: 'network_error', error: networkErr });
  });

  it('超长 detail 截断到 200 字符，防日志爆炸 / 噪音', async () => {
    const long = 'x'.repeat(500);
    const fetchMock = vi.fn().mockResolvedValue(new Response(long, { status: 500 }));

    const result = await performSignOut(fetchMock);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.detail.length).toBe(200);
      expect(result.httpStatus).toBe(500);
    }
  });

  it('res.text() 抛错时 detail 退化为空字符串，不让 sign-out 整体失败', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: vi.fn().mockRejectedValue(new Error('body already consumed')),
    } as unknown as Response);

    const result = await performSignOut(fetchMock);
    expect(result).toEqual({ status: 'failed', httpStatus: 502, detail: '' });
  });
});
