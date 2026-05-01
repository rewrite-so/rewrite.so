import type { RewriteRequest } from '@rewrite/shared';

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
  | { type: 'error'; code: string; message?: string; status?: number }
  | { type: 'end' };
