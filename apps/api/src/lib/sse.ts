import { type ErrorCode, encodeSSEFrame, type MetaStatus, type Style } from '@rewrite/shared';

/**
 * SSE 多路复用：
 * 把 N 个上游 content delta 流（每个标着一个 style）合并成单个 SSE 字节流。
 *
 * 协议（CLAUDE.md 已记录）：
 * - 一路 error 不影响其他路完成
 * - end 帧最后发送
 * - AbortSignal 中断时立即停止 enqueue 并 close
 */

export interface MuxInputStream {
  style: Style;
  iter: AsyncIterable<string>;
}

export interface MuxOptions {
  streams: MuxInputStream[];
  requestId: string;
  langDetected: string;
  /** 浮窗状态信息，透传到 meta event payload 让客户端 panel.setStatus 消费 */
  status?: MetaStatus;
  /**
   * 生命周期回调（可选）。调用方用于发 metrics、tracing 等 side-effect。
   * 不应抛出，不能阻塞主流程；实现内部用 try/catch 包住调用。
   */
  lifecycle?: {
    /** 第一路 delta 实际 enqueue 时触发；abort 前未触发说明用户没看到任何字节 */
    onFirstByte?: () => void;
    /** 所有路结束、end 帧 enqueue 后触发；最常见的成功收尾点 */
    onComplete?: () => void;
    /** 任意一路 stream 抛错时触发（可能多次，每路各一次） */
    onStreamError?: (errorCode: string) => void;
    /** signal abort 触发；用户/客户端主动断开 */
    onAbort?: () => void;
  };
}

export function muxToSSE(opts: MuxOptions, signal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const styles = opts.streams.map((s) => s.style);
  const lifecycle = opts.lifecycle;

  // 安全调用 lifecycle hook：不抛、不阻塞
  const safeCall = (fn?: () => void) => {
    if (!fn) return;
    try {
      fn();
    } catch {
      // 静默吞掉；hook 失败不影响 SSE 主流程
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let firstByteFired = false;
      const enqueue = (s: string) => {
        if (closed || signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          closed = true;
        }
      };

      // meta
      enqueue(
        encodeSSEFrame({
          event: 'meta',
          data: {
            requestId: opts.requestId,
            streams: styles,
            langDetected: opts.langDetected,
            ...(opts.status ? { status: opts.status } : {}),
          },
        }),
      );

      const onAbort = () => {
        closed = true;
        safeCall(lifecycle?.onAbort);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });

      const workers = opts.streams.map(async ({ style, iter }) => {
        let final = '';
        let seq = 0;
        try {
          for await (const text of iter) {
            if (closed || signal.aborted) return;
            if (!text) continue;
            seq++;
            final += text;
            if (!firstByteFired) {
              firstByteFired = true;
              safeCall(lifecycle?.onFirstByte);
            }
            enqueue(encodeSSEFrame({ event: 'delta', data: { style, text, seq } }));
          }
          enqueue(encodeSSEFrame({ event: 'done', data: { style, finalText: final } }));
        } catch (err) {
          const code = classifyError(err);
          if (lifecycle?.onStreamError) {
            try {
              lifecycle.onStreamError(code);
            } catch {
              // ignore
            }
          }
          enqueue(
            encodeSSEFrame({
              event: 'error',
              data: { style, code, message: (err as Error).message?.slice(0, 200) },
            }),
          );
        }
      });

      await Promise.allSettled(workers);

      if (!closed && !signal.aborted) {
        enqueue(encodeSSEFrame({ event: 'end', data: { requestId: opts.requestId } }));
        safeCall(lifecycle?.onComplete);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
      // abort 路径：onAbort 已在 signal listener 中触发；此处不再 onComplete
      signal.removeEventListener('abort', onAbort);
    },
    cancel() {
      // 客户端断开 → ReadableStream cancel；上游 abort 由调用方传入的 signal 控制
    },
  });
}

function classifyError(err: unknown): ErrorCode {
  const e = err as { name?: string; code?: string; status?: number };
  if (e.name === 'UpstreamError' && e.code === 'aborted') return 'upstream_error';
  if (e.name === 'UpstreamError' && e.code === 'timeout') return 'upstream_timeout';
  if (e.status && e.status >= 500) return 'upstream_error';
  if (e.status === 401 || e.status === 403) return 'unauthorized';
  return 'upstream_error';
}
