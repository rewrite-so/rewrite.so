import type { RewriteRequest } from '@rewrite/shared';

/**
 * 抽象 API 客户端：
 * - web: 直接 fetch（同源 cookie 自动携带）
 * - extension: chrome.runtime.connect 长连接代理（Phase 3 实现）
 *
 * `rewrite()` 返回原始 SSE 字节流；调用方用 parseSSEStream 解析。
 */
export interface RewriteApiClient {
  rewrite(req: RewriteRequest, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>;
}

export function createWebApiClient(opts: { apiBase: string }): RewriteApiClient {
  return {
    async rewrite(req, signal) {
      const res = await fetch(`${opts.apiBase}/v1/rewrite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        credentials: 'include',
        signal,
      });
      if (!res.ok) {
        throw new ApiError(res.status, await safeReadText(res));
      }
      if (!res.body) {
        throw new ApiError(500, 'empty response body');
      }
      return res.body;
    },
  };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`API error ${status}: ${detail}`);
    this.name = 'ApiError';
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
