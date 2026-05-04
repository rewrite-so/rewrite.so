import type { RewriteRequest } from '@rewrite/shared/api-contract';

/**
 * content script ↔ background SW 长连接消息协议（chrome.runtime.connect）。
 *
 * - C→B: { type: 'rewrite', req }    发起 rewrite 请求
 * - B→C: { type: 'chunk', data }     SSE 字节流（Uint8Array 序列化为 number[]）
 * - B→C: { type: 'error', code, ... } 错误（HTTP 非 2xx 或 fetch 失败）
 * - B→C: { type: 'end' }             SSE 流结束（content 端 close ReadableStream）
 *
 * Port name 必须使用 PORT_NAME_REWRITE。
 */
export const PORT_NAME_REWRITE = 'rewrite-so/rewrite';

export type FromContent = { type: 'rewrite'; req: RewriteRequest };

export type FromBackground =
  | { type: 'chunk'; data: number[] } // Uint8Array → Array.from()
  | {
      type: 'error';
      code: string;
      message?: string;
      status?: number;
      // 服务端 4xx body 的可选字段，bg 解析后透传给 content（让 setGlobalError 决定 CTA）
      // - quota_exceeded: authed / tier / used / limit / resetAt
      // - 其它错误一般无附加字段
      authed?: boolean;
      tier?: string;
      used?: number;
      limit?: number;
      resetAt?: string;
    }
  | { type: 'end' };
