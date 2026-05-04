import type { RewriteApiClient } from '@rewrite/core';
import { type FromBackground, type FromContent, PORT_NAME_REWRITE } from '../lib/port-protocol.ts';

/**
 * 在 content script 端创建 RewriteApiClient：把 rewrite() 调用通过
 * chrome.runtime.connect 长连接转发到 background SW，再把 background 推回的
 * chunk 还原为 ReadableStream<Uint8Array> 喂给 @rewrite/core 的 parseSSEStream。
 *
 * 为什么不直接 fetch？两点：
 * 1. content script 跨 origin 受限（CORS preflight + cookie 不带）
 * 2. background SW 是扩展统一的网络层，便于将来加 auth header / 缓存
 */
export function createPortApiClient(): RewriteApiClient {
  return {
    rewrite(req, signal) {
      return new Promise((resolve, reject) => {
        const port = chrome.runtime.connect({ name: PORT_NAME_REWRITE });

        let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
        let resolved = false;

        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            controller = c;
          },
          cancel() {
            try {
              port.disconnect();
            } catch {
              // ignore
            }
          },
        });

        const onMessage = (msg: FromBackground) => {
          if (msg.type === 'chunk') {
            controller?.enqueue(new Uint8Array(msg.data));
            // 第一帧到达时 resolve（这样调用方可以开始消费 stream）
            if (!resolved) {
              resolved = true;
              resolve(stream);
            }
            return;
          }
          if (msg.type === 'error') {
            // 用 ApiError-like 结构（带 detailObj）让 mount() 的 extractErrorCode/Detail
            // 拿到精确的 code + status + message + 服务端 4xx body 字段（authed/tier/
            // used/limit/resetAt），setGlobalError 能精确决定 CTA 文案 + 详细描述
            const err = new Error(`${msg.code}: ${msg.message ?? ''}`) as Error & {
              detailObj?: Record<string, unknown>;
            };
            err.detailObj = {
              error: msg.code,
              ...(msg.status !== undefined ? { status: msg.status } : {}),
              ...(msg.message !== undefined ? { message: msg.message } : {}),
              ...(msg.authed !== undefined ? { authed: msg.authed } : {}),
              ...(msg.tier !== undefined ? { tier: msg.tier } : {}),
              ...(msg.used !== undefined ? { used: msg.used } : {}),
              ...(msg.limit !== undefined ? { limit: msg.limit } : {}),
              ...(msg.resetAt !== undefined ? { resetAt: msg.resetAt } : {}),
            };
            if (!resolved) {
              resolved = true;
              reject(err);
            } else {
              try {
                controller?.error(err);
              } catch {
                // already errored
              }
            }
            return;
          }
          if (msg.type === 'end') {
            if (!resolved) {
              resolved = true;
              resolve(stream);
            }
            try {
              controller?.close();
            } catch {
              // already closed
            }
          }
        };

        port.onMessage.addListener(onMessage);

        port.onDisconnect.addListener(() => {
          const err = chrome.runtime.lastError?.message ?? 'port disconnected';
          if (!resolved) {
            resolved = true;
            reject(new Error(err));
            return;
          }
          try {
            controller?.close();
          } catch {
            // already closed
          }
        });

        signal.addEventListener('abort', () => {
          try {
            port.disconnect();
          } catch {
            // ignore
          }
        });

        const msg: FromContent = { type: 'rewrite', req };
        port.postMessage(msg);
      });
    },
  };
}
